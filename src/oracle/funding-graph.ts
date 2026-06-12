/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, Task 3.4, FR-5) — NOT a loa-freeside copy.
 *
 * Funding-graph construction + circular-flow cycle detection.
 *
 * ACKNOWLEDGED NET-NEW: ROLE3-ORACLE-SPEC.md:301-305 is explicit that the
 * always-available IChainProvider methods are balance/ownership only, and that
 * "Cycle-detection + funding-graph analysis is net-new code you build on top of
 * `getActivity`, not something the port gives you for free." This file IS that
 * net-new code. It is NOT inherited from loa-freeside.
 *
 * What it does:
 *   - Calls IChainProvider.getActivity (optional / Dune-Sim-exclusive; the
 *     MockChainProvider implements it for keyless runs) to pull each payer's
 *     transfer history.
 *   - Builds a directed funding graph: edge A→B means "A sent value to B".
 *   - Profiles each payer: wallet age (filter 4), external origin (filter 5),
 *     and whether the payer sits on a funding CYCLE (filter 3): an address that
 *     funds the payer is also (transitively) funded by the payer. For an x402
 *     payer that pays its service wallet, a back-edge service→…→payer is exactly
 *     "payer is funded by / routes back to the recipient service wallet"
 *     (ROLE3-ORACLE-SPEC.md:153-154).
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { IChainProvider } from '../core/ports/chain-provider.js';
import type { PayerProfile } from './types.js';
import { normalizeAddress } from './config.js';

/** Activity rows we depend on (subset of IChainProvider.getActivity's shape). */
interface ActivityEdge {
  from: string;
  to: string;
  value: bigint;
  timestamp: Date;
}

/**
 * Origin labels that signal genuine OUTSIDE demand (filter 5). A payer first
 * funded from one of these is up-weighted as a diagnostic. The classification
 * is carried on the activity `type`/`description` the provider returns; we match
 * case-insensitively on these substrings.
 */
const EXTERNAL_ORIGIN_MARKERS = ['cex', 'bridge', 'exchange', 'onramp', 'defi'] as const;

/**
 * Build the directed funding graph for a set of payers + their counterparties.
 *
 * @param payers       the payer addresses we score (normalized internally)
 * @param chainId      chain to query activity on
 * @param provider     chain provider (must implement optional getActivity)
 * @param activityLimit max activities to pull per address (provider-side cap)
 * @returns adjacency: funder → Set(funded), plus per-address first-funding info
 */
async function buildFundingGraph(
  payers: string[],
  chainId: number,
  provider: IChainProvider,
  activityLimit: number,
): Promise<{
  /** funder(normalized) → Set of recipients(normalized) it sent value to */
  outgoing: Map<string, Set<string>>;
  /** address(normalized) → its earliest observed activity timestamp */
  firstSeen: Map<string, Date>;
  /** address(normalized) → external-origin marker hit on its earliest inbound funding */
  externalOrigin: Set<string>;
}> {
  const outgoing = new Map<string, Set<string>>();
  const firstSeen = new Map<string, Date>();
  const externalOrigin = new Set<string>();

  if (typeof provider.getActivity !== 'function') {
    // No graph data available (e.g. a Tier-1-only provider with no Dune key).
    // Return an empty graph; callers degrade to "no circular flow detected,
    // no external origin" rather than fabricating edges. README states mock =
    // filter logic, dune = real data.
    return { outgoing, firstSeen, externalOrigin };
  }

  // Deterministic traversal order: sort payers so repeated runs issue calls and
  // record firstSeen in identical order (Assertion D).
  const sortedPayers = [...new Set(payers.map(normalizeAddress))].sort();

  for (const payer of sortedPayers) {
    const result = await provider.getActivity(payer as `0x${string}`, {
      chainIds: [chainId],
      limit: activityLimit,
    });
    if (!result) continue;

    // Activities are processed in deterministic (timestamp, txHash) order.
    const edges: ActivityEdge[] = result.activities
      .map((a) => ({
        from: normalizeAddress(a.from),
        to: normalizeAddress(a.to),
        value: a.value,
        timestamp: a.timestamp,
        type: `${a.type} ${a.description}`.toLowerCase(),
      }))
      .sort((x, y) =>
        x.timestamp.getTime() - y.timestamp.getTime() ||
        (x.from + x.to).localeCompare(y.from + y.to),
      )
      .map((a) => {
        // Record graph edge (only value-bearing transfers fund anything).
        if (a.value > 0n) {
          if (!outgoing.has(a.from)) outgoing.set(a.from, new Set());
          outgoing.get(a.from)!.add(a.to);
        }
        // Track earliest activity for every address we observe.
        for (const addr of [a.from, a.to]) {
          const prior = firstSeen.get(addr);
          if (!prior || a.timestamp < prior) firstSeen.set(addr, a.timestamp);
        }
        // External-origin: the FIRST inbound funding of this payer came from a
        // labeled external source (CEX / bridge / unrelated DeFi).
        if (a.to === payer && a.value > 0n) {
          if (EXTERNAL_ORIGIN_MARKERS.some((m) => a.type.includes(m))) {
            externalOrigin.add(payer);
          }
        }
        return a;
      });

    void edges; // edges already folded into the maps above
  }

  return { outgoing, firstSeen, externalOrigin };
}

/**
 * Does `payer` sit on a funding cycle? True iff some address X that the payer
 * can reach (payer →* X) also reaches back to the payer (X →* payer) with X ≠
 * payer. That is the "funded by, or routes back to" condition of Filter 3.
 *
 * Implemented as: compute the set reachable FROM payer; if any node in that set
 * can reach payer, there's a cycle through payer. We detect reach-back with a
 * reverse BFS from payer over the transposed graph.
 */
function findCycleCounterparties(
  payer: string,
  outgoing: Map<string, Set<string>>,
): string[] {
  // forward reachable set from payer (excluding payer itself)
  const forward = new Set<string>();
  const stack = [...(outgoing.get(payer) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === payer || forward.has(node)) continue;
    forward.add(node);
    for (const next of outgoing.get(node) ?? []) stack.push(next);
  }

  // nodes that can reach payer (reverse reachability) = ancestors of payer
  const ancestors = new Set<string>();
  // build transpose lazily via BFS: who points (transitively) into payer
  const incoming = new Map<string, Set<string>>();
  for (const [src, dsts] of outgoing) {
    for (const dst of dsts) {
      if (!incoming.has(dst)) incoming.set(dst, new Set());
      incoming.get(dst)!.add(src);
    }
  }
  const rstack = [...(incoming.get(payer) ?? [])];
  while (rstack.length > 0) {
    const node = rstack.pop()!;
    if (node === payer || ancestors.has(node)) continue;
    ancestors.add(node);
    for (const prev of incoming.get(node) ?? []) rstack.push(prev);
  }

  // cycle witnesses = nodes both reachable-from and able-to-reach payer
  const witnesses = [...forward].filter((n) => ancestors.has(n)).sort();
  return witnesses;
}

/**
 * Profile every payer: wallet age, external origin, circular-flow membership.
 * Deterministic: depends only on (payers, chainId, provider data, asOf).
 */
export async function profilePayers(
  payers: string[],
  chainId: number,
  provider: IChainProvider,
  asOf: Date,
  activityLimit = 100,
): Promise<Map<string, PayerProfile>> {
  const { outgoing, firstSeen, externalOrigin } = await buildFundingGraph(
    payers,
    chainId,
    provider,
    activityLimit,
  );

  const profiles = new Map<string, PayerProfile>();
  const MS_PER_DAY = 86_400_000;

  for (const raw of [...new Set(payers.map(normalizeAddress))].sort()) {
    const seen = firstSeen.get(raw) ?? null;
    const ageDays = seen ? Math.max(0, Math.floor((asOf.getTime() - seen.getTime()) / MS_PER_DAY)) : 0;
    const circularWith = findCycleCounterparties(raw, outgoing);

    profiles.set(raw, {
      address: raw,
      firstSeen: seen,
      ageDays,
      isCircular: circularWith.length > 0,
      circularWith,
      hasExternalOrigin: externalOrigin.has(raw),
    });
  }

  return profiles;
}
