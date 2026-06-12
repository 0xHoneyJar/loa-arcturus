/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, FR-5) — NOT a loa-freeside copy.
 *
 * The Oracle — Qualified Revenue ruleset & realness score (types).
 * Source of truth: ROLE3-ORACLE-SPEC.md §5, sdd.md §4. This file declares the
 * data shapes the oracle reads (x402_settlements rows), the payer profile it
 * builds from IChainProvider, and the per-service output it publishes.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** A persisted x402 settlement (one row of migration 0005 `x402_settlements`). */
export interface SettlementRow {
  /** Service that received the payment (groups revenue per service). */
  agent_id: string;
  /** On-chain payer (`proof.from`) — the anti-sybil trust anchor. */
  payer_address: string;
  /** EIP-155 chain id (e.g. 80069 Bepolia). */
  chain_id: number;
  /** On-chain transaction hash. */
  tx_hash: string;
  /** Real settled revenue in micro-USD. NUMERIC(30,0) → carried as bigint. */
  actual_micro: bigint;
  /** Settlement timestamp (UTC). */
  settled_at: Date;
}

/** Why a single settlement was excluded from Qualified Revenue (binary gates). */
export type ExclusionReason = 'affiliate' | 'dust' | 'circular';

/**
 * The per-payer on-chain profile the oracle derives from IChainProvider.getActivity.
 * `asOf`-relative so the same synthetic graph always yields the same profile
 * (Assertion D determinism — no wall-clock in the scoring path).
 */
export interface PayerProfile {
  address: string;
  /** Earliest observed activity; null if the payer has no history. */
  firstSeen: Date | null;
  /** Wallet age in whole days relative to the oracle's `asOf` reference time. */
  ageDays: number;
  /**
   * Circular flow: the payer sits on a funding cycle — an address that funded
   * the payer is also (transitively) funded BY the payer. For an x402 payer
   * that always pays its service wallet, this captures "funded by / routes back
   * to the recipient service wallet" (ROLE3-ORACLE-SPEC.md:153-154). NET-NEW.
   */
  isCircular: boolean;
  /** Counterparties that both fund and are funded by the payer (the cycle witnesses). */
  circularWith: string[];
  /** Funded from a CEX / bridge / unrelated-DeFi origin (genuine outside demand). */
  hasExternalOrigin: boolean;
}

/** A single settlement after the filter stack has classified it. */
export interface ClassifiedSettlement {
  tx_hash: string;
  payer_address: string;
  actual_micro: bigint;
  /** Passed all binary gates (1-3) → counts toward Qualified Revenue. */
  qualified: boolean;
  /** First binary gate that excluded it (undefined when qualified). */
  excludedBy?: ExclusionReason;
  /** Diagnostic wallet-age weight ∈ [floor,1] (filter 4 — NOT in the headline). */
  ageWeight: number;
  /** Diagnostic external-origin multiplier ≥ 1 (filter 5 — NOT in the headline). */
  originMultiplier: number;
}

/** Open, reproducible description of how a service's numbers were derived. */
export interface Methodology {
  version: string;
  /** Chain-provider mode that produced the payer profiles (mock | dune | rpc). */
  provider_mode: string;
  /** Reference time all age/window math is relative to (determinism anchor). */
  as_of: string;
  /** The headline formula, stated so an external party can re-derive it. */
  formula: string;
  /** OPEN-5 reconciliation, stated inline so the score stays reproducible. */
  weighting_reconciliation: string;
  filters: FilterDescriptor[];
  breakdown: ServiceBreakdown;
}

export interface FilterDescriptor {
  id: number;
  name: string;
  /** 'binary_gate' feeds the headline Σ; 'diagnostic_weight' does NOT. */
  kind: 'binary_gate' | 'diagnostic_weight';
  effect: string;
  /** Filter-specific parameters (thresholds, sizes, sources) — all reproducible. */
  params: Record<string, unknown>;
  /** True for analysis the PoC adds on top of getActivity (not inherited). */
  net_new?: boolean;
}

export interface ServiceBreakdown {
  settlement_count: number;
  raw_micro: string;
  qualified_micro: string;
  flagged_affiliated_micro: string;
  dropped_dust_micro: string;
  dropped_circular_micro: string;
  /** Diagnostic only: Σ qualified actual_micro × ageWeight × originMultiplier. */
  confidence_weighted_qualified_micro: string;
  affiliated_payers: number;
  circular_payers: number;
}

/** Per-service oracle output (ROLE3-ORACLE-SPEC.md §5 / sdd.md §5.1). */
export interface ServiceRevenue {
  agent_id: string;
  raw_micro: bigint;
  qualified_micro: bigint;
  /** qualified_micro / raw_micro ∈ [0,1]. */
  score: number;
  /** Revenue from affiliated payers — labeled and EXCLUDED from the headline. */
  flagged_affiliated_micro: bigint;
  methodology: Methodology;
}
