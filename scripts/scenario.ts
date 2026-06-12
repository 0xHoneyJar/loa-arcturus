/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 4, FR-6) — acceptance-harness shared scenario.
 *
 * The SINGLE source of truth the seed script and the verify script agree on, so
 * the meter is graded against the SAME wallets it was seeded with. The seed
 * writes these settlements through the real settle() path; verify re-derives the
 * expected Assertion A/B outcomes from THIS classification (never hardcoded
 * numbers) and checks them against the real oracle output.
 *
 * It reuses the fixed synthetic funding graph the oracle module already ships
 * (src/oracle/synthetic-graph.ts) — the MockChainProvider serves the same graph
 * (ROLE3-ORACLE-SPEC.md §10.5: "MockChainProvider seeded with the SAME synthetic
 * funding graph the seed script created"). This is the SAME six-settlement
 * scenario Sprint 3 live-verified (svc-honeyjar score 0.20, svc-thirdparty ≈0.50).
 *
 * Addresses are obviously-synthetic, clearly-labeled 0x… strings — nothing is
 * invented to look like a real on-chain address. In CHAIN_PROVIDER=rpc the
 * `payer` field is REPLACED at runtime by the real on-chain `from` of each
 * self-broadcast tx (see scripts/seed-bepolia.ts); these synthetic addresses are
 * only the mock/identity labels.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  ADDR,
  SYNTHETIC_GRAPH,
  SYNTHETIC_AS_OF,
} from '../src/oracle/synthetic-graph.js';

export { ADDR, SYNTHETIC_GRAPH, SYNTHETIC_AS_OF };

/** Single-tenant PoC community (matches Sprint 1-3 verification). */
export const COMMUNITY = '00000000-0000-0000-0000-000000000001';

/** The chain the PoC settles on — Bepolia 80069 (CHAIN_CONFIGS.bepolia). */
export const CHAIN_ID = 80069;

const CENT = 10_000n; // 1¢ in micro-USD
const DOLLAR = 100n * CENT;

/**
 * Why each payer is in the scenario. Drives Assertion A (every non-clean payer
 * is excluded) and Assertion B (every clean payer survives) — computed against
 * the real oracle output, so the assertions test the meter, not a fixture.
 */
export type PayerRole =
  | 'clean' // external-funded, aged → SURVIVES into Qualified
  | 'farm-circular' // funded-by/routes-back-to its service → Filter 3 drop
  | 'farm-dust' // sub-cent spam → Filter 2 drop
  | 'affiliate'; // 0xhoneyjar-affiliated → Filter 1 flag-not-count

/** One synthetic settlement the seed drives through the real settle() path. */
export interface ScenarioSettlement {
  /** Service that received the payment (the revenue recipient / agent_id). */
  agent_id: string;
  /** Synthetic payer label (mock identity; replaced by real `from` in rpc mode). */
  payer: string;
  /** Real settled revenue in micro-USD. */
  actual_micro: bigint;
  /** Stable scenario tx label (synthetic in mock; the real tx_hash in rpc mode). */
  tx: string;
  /** Why this payer is here — drives the assertion expectations. */
  role: PayerRole;
}

/**
 * The fixed six-settlement scenario (identical to the Sprint-3 verify-live set).
 *   svc-thirdparty: 2 clean ($40 + $60) survive; circular farm ($100) + dust
 *                   (5 micro) excluded → score ≈ 0.50.
 *   svc-honeyjar:   affiliate ($80) flagged + excluded; 1 clean ($20) survives
 *                   → score 0.20 (anti-self-grading).
 */
export const SCENARIO: ScenarioSettlement[] = [
  { agent_id: 'svc-thirdparty', payer: ADDR.cleanAgedCex,    actual_micro: 40n * DOLLAR, tx: '0xtp_clean_cex',     role: 'clean' },
  { agent_id: 'svc-thirdparty', payer: ADDR.cleanAgedBridge, actual_micro: 60n * DOLLAR, tx: '0xtp_clean_bridge',  role: 'clean' },
  { agent_id: 'svc-thirdparty', payer: ADDR.farmCircular,    actual_micro: 100n * DOLLAR, tx: '0xtp_farm_circular', role: 'farm-circular' },
  { agent_id: 'svc-thirdparty', payer: ADDR.farmDust,        actual_micro: 5n,           tx: '0xtp_farm_dust',     role: 'farm-dust' },
  { agent_id: 'svc-honeyjar',   payer: ADDR.affiliatePayer,  actual_micro: 80n * DOLLAR, tx: '0xhj_affiliate',     role: 'affiliate' },
  { agent_id: 'svc-honeyjar',   payer: ADDR.cleanAgedCex,    actual_micro: 20n * DOLLAR, tx: '0xhj_clean',         role: 'clean' },
];

/** Payer addresses the oracle must treat as affiliated (Filter 1, OPEN-3). */
export const SCENARIO_AFFILIATES: string[] = [ADDR.affiliatePayer];

/** A payer is "expected qualified" iff its role is clean. */
export function isCleanRole(role: PayerRole): boolean {
  return role === 'clean';
}
