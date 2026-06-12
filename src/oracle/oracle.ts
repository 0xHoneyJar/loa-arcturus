/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, FR-5) — NOT a loa-freeside copy.
 *
 * The Oracle — Qualified Revenue ruleset & realness score.
 * ROLE3-ORACLE-SPEC.md §5 / sdd.md §4. Reads x402_settlements + IChainProvider,
 * applies the 5-filter stack, and emits per-service:
 *   { raw_micro, qualified_micro, score, flagged_affiliated_micro, methodology }.
 *
 * READ-ONLY: this module never writes chain state and never gates emissions.
 * Role 1 (PoL) is OUT OF SCOPE (ROLE3-ORACLE-SPEC.md:170, 205, 211-219).
 *
 * ANTI-SELF-GRADING (credibility-critical, ROLE3-ORACLE-SPEC.md:164-167):
 *   Every service is indexed and held to the SAME filters. Affiliated payers are
 *   labeled (flagged_affiliated_micro) and EXCLUDED from the headline. There is
 *   NO code path that privileges affiliated revenue — the oracle will report
 *   ~$0 qualified for a 0xhoneyjar service paid only by affiliated wallets, and
 *   that honesty is the product.
 *
 * DETERMINISM (Assertion D precursor): the scoring path takes an `asOf`
 * reference time and never reads the wall clock. Given the same settlements +
 * same provider data + same `asOf` + same config, output is byte-identical.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { IChainProvider } from '../core/ports/chain-provider.js';
import type {
  ClassifiedSettlement,
  FilterDescriptor,
  Methodology,
  PayerProfile,
  ServiceRevenue,
  SettlementRow,
} from './types.js';
import type { SettlementsRepo, TimeWindow } from './settlements-repo.js';
import { profilePayers } from './funding-graph.js';
import {
  ORACLE_METHODOLOGY_VERSION,
  normalizeAddress,
  type WeightingParams,
} from './config.js';

/** Everything the oracle needs to score a service (injected → testable, pure). */
export interface OracleDeps {
  settlementsRepo: SettlementsRepo;
  chainProvider: IChainProvider;
  /** Normalized affiliate allowlist (resolveAffiliateAllowlist()). */
  affiliateAllowlist: Set<string>;
  /** Dust floor in micro-USD (resolveDustFloorMicro()). */
  dustFloorMicro: bigint;
  /** Diagnostic weighting params (resolveWeightingParams()). */
  weighting: WeightingParams;
  /** Provider mode label for the methodology (e.g. 'mock', 'dune', 'rpc'). */
  providerMode: string;
  /** Chain to profile payers on (e.g. 80069 Bepolia). */
  chainId: number;
  /**
   * Determinism anchor: all wallet-age / window math is relative to this.
   * MUST be supplied by the caller (never Date.now() inside the scoring path).
   */
  asOf: Date;
}

/** Clamp helper for the diagnostic age weight. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Diagnostic age weight ∈ [floor,1] (filter 4 — NOT in the headline). */
function ageWeight(profile: PayerProfile, w: WeightingParams): number {
  const ramp = clamp(profile.ageDays / w.ageFullTrustDays, 0, 1);
  return clamp(w.ageWeightFloor + (1 - w.ageWeightFloor) * ramp, w.ageWeightFloor, 1);
}

/** Diagnostic external-origin multiplier ≥ 1 (filter 5 — NOT in the headline). */
function originMultiplier(profile: PayerProfile, w: WeightingParams): number {
  return profile.hasExternalOrigin ? w.externalOriginBonus : 1.0;
}

/**
 * Classify one settlement through the binary gates (filters 1-3) and attach the
 * diagnostic weights (filters 4-5). A settlement is `qualified` iff it clears
 * ALL THREE binary gates. The first failing gate is recorded in `excludedBy`.
 *
 * GATE ORDER (deterministic, documented): affiliate → dust → circular. Affiliate
 * is first so affiliated revenue is always attributed to flagged_affiliated_micro
 * (anti-self-grading), regardless of whether it would also be dust/circular.
 */
function classify(
  s: SettlementRow,
  profile: PayerProfile,
  affiliateAllowlist: Set<string>,
  dustFloorMicro: bigint,
  w: WeightingParams,
): ClassifiedSettlement {
  const payer = normalizeAddress(s.payer_address);
  let excludedBy: ClassifiedSettlement['excludedBy'];

  if (affiliateAllowlist.has(payer)) {
    excludedBy = 'affiliate';
  } else if (s.actual_micro < dustFloorMicro) {
    excludedBy = 'dust';
  } else if (profile.isCircular) {
    excludedBy = 'circular';
  }

  return {
    tx_hash: s.tx_hash,
    payer_address: payer,
    actual_micro: s.actual_micro,
    qualified: excludedBy === undefined,
    excludedBy,
    ageWeight: ageWeight(profile, w),
    originMultiplier: originMultiplier(profile, w),
  };
}

/** Static descriptors of the filter stack for the open methodology output. */
function filterDescriptors(deps: OracleDeps): FilterDescriptor[] {
  return [
    {
      id: 1,
      name: 'affiliate-exclusion',
      kind: 'binary_gate',
      effect: 'Drop settlements whose payer is on the affiliate allowlist; flag (not count) the revenue.',
      params: { allowlist_size: deps.affiliateAllowlist.size },
    },
    {
      id: 2,
      name: 'dust-floor',
      kind: 'binary_gate',
      effect: 'Drop settlements with actual_micro below the dust floor (anti-spam wash).',
      params: { dust_floor_micro: deps.dustFloorMicro.toString(), unit: 'micro-USD' },
    },
    {
      id: 3,
      name: 'circular-flow',
      kind: 'binary_gate',
      effect: 'Drop settlements whose payer sits on a funding cycle with the recipient (funded by / routes back to).',
      params: { method: 'directed funding graph + cycle detection over getActivity' },
      net_new: true,
    },
    {
      id: 4,
      name: 'wallet-age-weighting',
      kind: 'diagnostic_weight',
      effect: 'Down-weight fresh wallets, up-weight aged wallets. Diagnostic only — NOT in the headline score.',
      params: {
        age_full_trust_days: deps.weighting.ageFullTrustDays,
        age_weight_floor: deps.weighting.ageWeightFloor,
      },
    },
    {
      id: 5,
      name: 'external-origin-bonus',
      kind: 'diagnostic_weight',
      effect: 'Up-weight payers funded from CEX/bridge/unrelated-DeFi. Diagnostic only — NOT in the headline score.',
      params: { external_origin_bonus: deps.weighting.externalOriginBonus },
    },
  ];
}

/**
 * Compute Raw / Qualified / score for ONE service.
 *
 * @returns ServiceRevenue with the open, reproducible methodology attached.
 */
export async function computeServiceRevenue(
  agentId: string,
  deps: OracleDeps,
  window?: TimeWindow,
): Promise<ServiceRevenue> {
  const settlements = await deps.settlementsRepo.settlementsForAgent(agentId, window);

  // Profile every distinct payer of this service (one funding-graph pass).
  const payerAddrs = [...new Set(settlements.map((s) => normalizeAddress(s.payer_address)))];
  const profiles = await profilePayers(payerAddrs, deps.chainId, deps.chainProvider, deps.asOf);

  // Empty profile fallback: a payer with no on-chain history is age 0, not
  // circular, no external origin — it still flows through dust/affiliate gates.
  const profileFor = (addr: string): PayerProfile =>
    profiles.get(addr) ?? {
      address: addr,
      firstSeen: null,
      ageDays: 0,
      isCircular: false,
      circularWith: [],
      hasExternalOrigin: false,
    };

  let raw = 0n;
  let qualified = 0n;
  let flaggedAffiliated = 0n;
  let droppedDust = 0n;
  let droppedCircular = 0n;
  let confidenceWeighted = 0n; // diagnostic Σ (qualified × ageWeight × originMult)
  const affiliatedPayers = new Set<string>();
  const circularPayers = new Set<string>();

  for (const s of settlements) {
    raw += s.actual_micro;
    const profile = profileFor(normalizeAddress(s.payer_address));
    const c = classify(s, profile, deps.affiliateAllowlist, deps.dustFloorMicro, deps.weighting);

    if (c.qualified) {
      qualified += s.actual_micro;
      // Diagnostic weighted sum — floored to integer micro to stay deterministic.
      const weighted = BigInt(Math.floor(Number(s.actual_micro) * c.ageWeight * c.originMultiplier));
      confidenceWeighted += weighted;
    } else if (c.excludedBy === 'affiliate') {
      flaggedAffiliated += s.actual_micro;
      affiliatedPayers.add(c.payer_address);
    } else if (c.excludedBy === 'dust') {
      droppedDust += s.actual_micro;
    } else if (c.excludedBy === 'circular') {
      droppedCircular += s.actual_micro;
      circularPayers.add(c.payer_address);
    }
  }

  // Headline score = qualified / raw ∈ [0,1]. raw=0 → score 0 (no revenue, no realness).
  const score = raw === 0n ? 0 : clamp(Number(qualified) / Number(raw), 0, 1);

  const methodology: Methodology = {
    version: ORACLE_METHODOLOGY_VERSION,
    provider_mode: deps.providerMode,
    as_of: deps.asOf.toISOString(),
    formula: 'score = qualified_micro / raw_micro ∈ [0,1]; qualified_micro = Σ actual_micro over settlements passing binary gates 1-3 (unweighted).',
    weighting_reconciliation:
      'Filters 1-3 are binary gates that decide membership in qualified_micro. Filters 4-5 (wallet-age, external-origin) are DIAGNOSTIC weights surfaced as confidence_weighted_qualified_micro and DO NOT enter the headline score, so the headline is reproducible from the binary rules alone (OPEN-5; sdd.md §4.3 option a).',
    filters: filterDescriptors(deps),
    breakdown: {
      settlement_count: settlements.length,
      raw_micro: raw.toString(),
      qualified_micro: qualified.toString(),
      flagged_affiliated_micro: flaggedAffiliated.toString(),
      dropped_dust_micro: droppedDust.toString(),
      dropped_circular_micro: droppedCircular.toString(),
      confidence_weighted_qualified_micro: confidenceWeighted.toString(),
      affiliated_payers: affiliatedPayers.size,
      circular_payers: circularPayers.size,
    },
  };

  return {
    agent_id: agentId,
    raw_micro: raw,
    qualified_micro: qualified,
    score,
    flagged_affiliated_micro: flaggedAffiliated,
    methodology,
  };
}

/**
 * Compute revenue for ALL services present in the window — anti-self-grading
 * applies uniformly because every agent_id is indexed and scored the same way.
 * Returns results sorted by agent_id (deterministic).
 */
export async function computeAllServices(
  deps: OracleDeps,
  window?: TimeWindow,
): Promise<ServiceRevenue[]> {
  const agentIds = await deps.settlementsRepo.listAgentIds(window);
  const out: ServiceRevenue[] = [];
  for (const id of [...agentIds].sort()) {
    out.push(await computeServiceRevenue(id, deps, window));
  }
  return out;
}
