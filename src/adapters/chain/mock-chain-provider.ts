/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, Task 3.7, FR-5) — NOT a loa-freeside copy.
 *
 * MockChainProvider — keyless IChainProvider for running the full filter logic
 * with ZERO external API keys (ROLE3-ORACLE-SPEC.md:266-272 / sdd.md §7.4).
 *
 * Selected via CHAIN_PROVIDER=mock. It implements the Dune-Sim-exclusive
 * `getActivity` over a DETERMINISTIC, in-memory synthetic funding graph so the
 * oracle's §5 filters (especially circular-flow cycle detection) can be
 * exercised and re-run with byte-identical results (Assertion D precursor).
 *
 * Determinism contract: this provider holds NO clocks, NO randomness, NO
 * network I/O. Every timestamp is derived from a fixed `epoch` passed at
 * construction (or the built-in default). Two providers built from the same
 * graph + epoch return identical activity for identical queries, in identical
 * order. README states: mock = filter logic, dune = real data.
 *
 * What this is NOT: it is not a real chain. It fabricates no claim about real
 * Bepolia revenue — it only feeds the FILTER LOGIC a known graph so we can
 * prove the meter classifies farm-like vs clean wallets correctly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  Address,
  AssetConfig,
  ChainId,
  CrossChainScore,
  IChainProvider,
  RankedHolder,
  ActionHistoryConfig,
} from '../../core/ports/chain-provider.js';

/** One synthetic funding transfer: `from` sent `value` to `to` at `dayOffset`. */
export interface SyntheticTransfer {
  from: string;
  to: string;
  /** Native-unit value (wei-scale). Any value > 0 creates a funding edge. */
  value: bigint;
  /** Whole-day offset from the graph epoch (smaller = older = funded earlier). */
  dayOffset: number;
  /** Optional origin label, e.g. 'cex', 'bridge', 'defi' (external-origin signal). */
  origin?: string;
  /** Activity type label (defaults to 'transfer'). */
  type?: string;
}

/** A complete synthetic funding graph the mock serves activity from. */
export interface SyntheticGraph {
  /** Reference epoch; all activity timestamps are epoch + dayOffset days. */
  epoch: Date;
  transfers: SyntheticTransfer[];
}

const MS_PER_DAY = 86_400_000;

/** Stable native-unit → display; value-bearing edges are what matter to the graph. */
function activityFromTransfer(t: SyntheticTransfer, epoch: Date) {
  return {
    txHash: synthTxHash(t),
    blockNumber: t.dayOffset, // monotone, deterministic
    timestamp: new Date(epoch.getTime() + t.dayOffset * MS_PER_DAY),
    type: t.type ?? 'transfer',
    description: t.origin ? `${t.origin} funding` : 'transfer',
    from: t.from,
    to: t.to,
    value: t.value,
    fee: 0n,
    feeUsd: null as number | null,
    chainId: 80069,
    status: 'success' as const,
  };
}

/** Deterministic synthetic tx hash from the transfer fields (no randomness). */
function synthTxHash(t: SyntheticTransfer): string {
  const basis = `${t.from}->${t.to}:${t.value.toString()}@${t.dayOffset}`;
  let h = 0;
  for (let i = 0; i < basis.length; i++) {
    h = (h * 31 + basis.charCodeAt(i)) >>> 0;
  }
  return '0xmock' + h.toString(16).padStart(8, '0');
}

/**
 * Keyless, deterministic IChainProvider over a fixed synthetic funding graph.
 * Only the methods the oracle actually uses are meaningfully implemented;
 * Tier-1/Tier-2 methods the oracle does not call return inert/typed stubs.
 */
export class MockChainProvider implements IChainProvider {
  private readonly epoch: Date;
  /** address(lowercased) → activities involving it, sorted ascending by time. */
  private readonly byAddress: Map<string, ReturnType<typeof activityFromTransfer>[]> = new Map();

  constructor(graph: SyntheticGraph) {
    this.epoch = graph.epoch;
    // Sort transfers deterministically before indexing so output order is fixed.
    const sorted = [...graph.transfers].sort(
      (a, b) =>
        a.dayOffset - b.dayOffset ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    );
    for (const t of sorted) {
      const act = activityFromTransfer(t, this.epoch);
      for (const addr of [t.from.toLowerCase(), t.to.toLowerCase()]) {
        if (!this.byAddress.has(addr)) this.byAddress.set(addr, []);
        this.byAddress.get(addr)!.push(act);
      }
    }
  }

  // ---- Dune-Sim-exclusive method the oracle's funding graph depends on ----

  async getActivity(
    address: Address,
    options?: { chainIds?: number[]; limit?: number; cursor?: string; types?: string[] },
  ): Promise<{
    activities: Array<{
      txHash: string;
      blockNumber: number;
      timestamp: Date;
      type: string;
      description: string;
      from: string;
      to: string;
      value: bigint;
      fee: bigint;
      feeUsd: number | null;
      chainId: number;
      status: 'success' | 'failed';
    }>;
    nextCursor: string | null;
  }> {
    const all = this.byAddress.get(address.toLowerCase()) ?? [];
    const limit = options?.limit ?? all.length;
    // Already sorted ascending by (time, from, to) at construction → deterministic.
    const activities = all.slice(0, limit).map((a) => ({ ...a }));
    return { activities, nextCursor: null };
  }

  // ---- Tier-1 methods (not used by the oracle; deterministic inert stubs) ----

  async hasBalance(): Promise<boolean> {
    return false;
  }
  async ownsNFT(): Promise<boolean> {
    return false;
  }
  async getBalance(): Promise<bigint> {
    return 0n;
  }
  async getNativeBalance(): Promise<bigint> {
    return 0n;
  }

  // ---- Tier-2 / Score-Service methods (unavailable, like DuneSimClient) ----

  async getRankedHolders(_asset: AssetConfig, _limit: number, _offset?: number): Promise<RankedHolder[]> {
    throw new Error('getRankedHolders not available in MockChainProvider (Tier-2).');
  }
  async getAddressRank(_address: Address, _asset: AssetConfig): Promise<number | null> {
    throw new Error('getAddressRank not available in MockChainProvider (Tier-2).');
  }
  async checkActionHistory(_address: Address, _config: ActionHistoryConfig): Promise<boolean> {
    throw new Error('checkActionHistory not available in MockChainProvider (Tier-2).');
  }
  async getCrossChainScore(_address: Address, _chains: ChainId[]): Promise<CrossChainScore> {
    throw new Error('getCrossChainScore not available in MockChainProvider (Tier-2).');
  }
  async isScoreServiceAvailable(): Promise<boolean> {
    return false;
  }
  getSupportedChains(): ChainId[] {
    return [80069, 80094];
  }
}
