/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, Task 3.7, FR-5) — NOT a loa-freeside copy.
 *
 * The fixed synthetic funding graph used to PROVE the meter works without a
 * Dune key. It pairs with a fixed set of synthetic settlements (below) so the
 * same scenario can be driven through (a) the MockChainProvider for filter
 * logic and (b) a real Postgres for the live revenue computation — and both
 * agree (sdd.md §7.4: the mock is seeded with the SAME synthetic graph the seed
 * script created).
 *
 * Scenario (all addresses are obviously-synthetic 0x…labels, nothing invented
 * to look real):
 *
 *   SERVICE wallets (revenue recipients):
 *     0x…service_clean   — a healthy 3rd-party service
 *     0x…service_honeyjar— a 0xhoneyjar-affiliated service (anti-self-grading)
 *
 *   CLEAN payers (should SURVIVE into Qualified):
 *     0x…clean_aged_cex   — 60-day-old wallet, first funded from a CEX
 *     0x…clean_aged_bridge— 45-day-old wallet, first funded from a bridge
 *
 *   FARM-LIKE payers (should be EXCLUDED, reducing the score):
 *     0x…farm_circular    — funded BY the service it pays, and routes back
 *                           (circular-flow cycle) → Filter 3 drop
 *     0x…farm_dust        — pays sub-cent amounts → Filter 2 drop
 *
 *   AFFILIATE payer (anti-self-grading; only meaningful once the allowlist is
 *   populated — the live test injects it into the allowlist explicitly):
 *     0x…affiliate_payer  — pays service_honeyjar; flagged + excluded.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { SyntheticGraph } from '../adapters/chain/mock-chain-provider.js';

// Obviously-synthetic, clearly-labeled addresses (40 hex chars; the trailing
// ASCII-ish label segment makes their synthetic nature unmistakable).
export const ADDR = {
  serviceClean: '0x5e41cec1ea0000000000000000000000c1ea0001', // "service clean"
  serviceHoneyjar: '0x5e41cec1ea000000000000000000000ad00d0002', // "service honeyjar"
  cexHotWallet: '0xcec0000000000000000000000000000000000003', // external CEX origin
  bridgeWallet: '0xb41d6e0000000000000000000000000000000004', // external bridge origin
  cleanAgedCex: '0xc1ea0a6ed00000000000000000000000000c0005', // clean, aged, CEX-funded
  cleanAgedBridge: '0xc1ea0a6ed00000000000000000000000000b0006', // clean, aged, bridge-funded
  farmCircular: '0xfa46c14c01a40000000000000000000000000007', // circular-flow farm
  farmDust: '0xfa46d05700000000000000000000000000000008', // dust-spam farm
  affiliatePayer: '0xaff111a7e00000000000000000000000000000009', // affiliate (anti-self-grade)
} as const;

/** Fixed epoch for the synthetic graph (determinism anchor; NOT wall clock). */
export const SYNTHETIC_EPOCH = new Date('2026-01-01T00:00:00.000Z');

/**
 * The oracle's `asOf` reference for the synthetic scenario. 90 days after epoch
 * so the aged clean wallets read as 45-60 days old. Passed explicitly into the
 * oracle so wallet-age math is deterministic.
 */
export const SYNTHETIC_AS_OF = new Date('2026-04-01T00:00:00.000Z'); // epoch + 90d

const ONE = 10n ** 18n; // 1 native unit (wei-scale)

/**
 * The funding graph. dayOffset is days after SYNTHETIC_EPOCH (smaller = older).
 * Clean wallets get a single external (CEX/bridge) funding early → aged +
 * external origin. The circular farm is funded by its own service and sends
 * back → a cycle. The dust farm just needs to exist (its settlements are
 * sub-cent; the graph only needs to make it non-circular and recent).
 */
export const SYNTHETIC_GRAPH: SyntheticGraph = {
  epoch: SYNTHETIC_EPOCH,
  transfers: [
    // Clean aged CEX-funded payer: first inbound from a CEX hot wallet at day 30.
    { from: ADDR.cexHotWallet, to: ADDR.cleanAgedCex, value: 5n * ONE, dayOffset: 30, origin: 'cex' },
    // Clean aged bridge-funded payer: first inbound from a bridge at day 45.
    { from: ADDR.bridgeWallet, to: ADDR.cleanAgedBridge, value: 3n * ONE, dayOffset: 45, origin: 'bridge' },

    // Circular farm: the 0xhoneyjar service funds the farm wallet (day 80)...
    { from: ADDR.serviceHoneyjar, to: ADDR.farmCircular, value: 2n * ONE, dayOffset: 80 },
    // ...and the farm wallet routes value back to the service (day 82) → CYCLE.
    { from: ADDR.farmCircular, to: ADDR.serviceHoneyjar, value: 1n * ONE, dayOffset: 82 },

    // Dust farm: a fresh wallet self-funded from another fresh wallet at day 88
    // (no external origin, recent → low age weight, but its DROP comes from the
    // dust floor on its settlement amounts, not the graph).
    { from: ADDR.farmDust, to: ADDR.farmDust, value: 0n, dayOffset: 88 },

    // Affiliate payer: funded from a CEX (so absent the allowlist it would look
    // clean) — proving the allowlist flag is what excludes it, not its graph.
    { from: ADDR.cexHotWallet, to: ADDR.affiliatePayer, value: 4n * ONE, dayOffset: 20, origin: 'cex' },
  ],
};
