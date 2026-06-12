/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, FR-5) — oracle unit + determinism tests.
 *
 * Proves, with NO database and NO network:
 *   - each of the 5 filters does what the spec says;
 *   - the headline score = qualified/raw ∈ [0,1] from binary gates only (OPEN-5);
 *   - anti-self-grading: an affiliated payer is flagged + excluded from headline;
 *   - the MockChainProvider + oracle are DETERMINISTIC (byte-identical reruns,
 *     Assertion D precursor);
 *   - farm-like wallets reduce the score; clean wallets survive.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from 'vitest';
import { computeServiceRevenue, computeAllServices, type OracleDeps } from './oracle.js';
import type { SettlementsRepo, TimeWindow } from './settlements-repo.js';
import type { SettlementRow, ServiceRevenue } from './types.js';
import { DEFAULT_DUST_FLOOR_MICRO, DEFAULT_WEIGHTING, normalizeAddress } from './config.js';
import { MockChainProvider } from '../adapters/chain/mock-chain-provider.js';
import {
  ADDR,
  SYNTHETIC_GRAPH,
  SYNTHETIC_AS_OF,
} from './synthetic-graph.js';

// --- In-memory settlements repo (no DB) -----------------------------------

class FakeRepo implements SettlementsRepo {
  constructor(private rows: SettlementRow[]) {}
  async listAgentIds(_w?: TimeWindow): Promise<string[]> {
    return [...new Set(this.rows.map((r) => r.agent_id))].sort();
  }
  async settlementsForAgent(agentId: string, _w?: TimeWindow): Promise<SettlementRow[]> {
    return this.rows
      .filter((r) => r.agent_id === agentId)
      .sort((a, b) => a.settled_at.getTime() - b.settled_at.getTime() || a.tx_hash.localeCompare(b.tx_hash));
  }
}

function row(p: Partial<SettlementRow> & Pick<SettlementRow, 'agent_id' | 'payer_address' | 'actual_micro' | 'tx_hash'>): SettlementRow {
  return {
    chain_id: 80069,
    nonce: p.tx_hash,
    settled_at: new Date('2026-03-15T00:00:00.000Z'),
    ...p,
  } as SettlementRow;
}

const CENT = 10_000n; // 1¢ in micro-USD
const DOLLAR = 100n * CENT;

function depsFor(
  rows: SettlementRow[],
  overrides: Partial<OracleDeps> = {},
): OracleDeps {
  return {
    settlementsRepo: new FakeRepo(rows),
    chainProvider: new MockChainProvider(SYNTHETIC_GRAPH),
    affiliateAllowlist: new Set<string>(),
    dustFloorMicro: DEFAULT_DUST_FLOOR_MICRO,
    weighting: DEFAULT_WEIGHTING,
    providerMode: 'mock',
    chainId: 80069,
    asOf: SYNTHETIC_AS_OF,
    ...overrides,
  };
}

describe('Filter 1 — affiliate exclusion (flag-not-count, anti-self-grading)', () => {
  it('flags affiliated revenue and EXCLUDES it from the headline', async () => {
    const rows = [
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 10n * DOLLAR, tx_hash: '0xclean' }),
      row({ agent_id: 'svc', payer_address: ADDR.affiliatePayer, actual_micro: 90n * DOLLAR, tx_hash: '0xaffil' }),
    ];
    const deps = depsFor(rows, {
      affiliateAllowlist: new Set([normalizeAddress(ADDR.affiliatePayer)]),
    });
    const res = await computeServiceRevenue('svc', deps);

    expect(res.raw_micro).toBe(100n * DOLLAR);
    expect(res.flagged_affiliated_micro).toBe(90n * DOLLAR);
    expect(res.qualified_micro).toBe(10n * DOLLAR); // affiliated revenue NOT counted
    expect(res.score).toBeCloseTo(0.1, 10);
  });

  it('reports ~$0 qualified when ALL revenue is affiliated (willing to report ~0)', async () => {
    const rows = [
      row({ agent_id: 'honeyjar', payer_address: ADDR.affiliatePayer, actual_micro: 50n * DOLLAR, tx_hash: '0xself' }),
    ];
    const deps = depsFor(rows, {
      affiliateAllowlist: new Set([normalizeAddress(ADDR.affiliatePayer)]),
    });
    const res = await computeServiceRevenue('honeyjar', deps);
    expect(res.raw_micro).toBe(50n * DOLLAR);
    expect(res.qualified_micro).toBe(0n);
    expect(res.flagged_affiliated_micro).toBe(50n * DOLLAR);
    expect(res.score).toBe(0);
  });
});

describe('Filter 2 — dust floor', () => {
  it('drops sub-floor settlements; keeps at-or-above floor', async () => {
    const rows = [
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: CENT, tx_hash: '0xexact' }), // == floor → kept
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedBridge, actual_micro: CENT - 1n, tx_hash: '0xdust' }), // < floor → dropped
    ];
    const res = await computeServiceRevenue('svc', depsFor(rows));
    expect(res.raw_micro).toBe(2n * CENT - 1n);
    expect(res.qualified_micro).toBe(CENT);
    expect(res.methodology.breakdown.dropped_dust_micro).toBe((CENT - 1n).toString());
  });

  it('dust floor of 0 disables the filter', async () => {
    const rows = [row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 1n, tx_hash: '0xtiny' })];
    const res = await computeServiceRevenue('svc', depsFor(rows, { dustFloorMicro: 0n }));
    expect(res.qualified_micro).toBe(1n);
  });
});

describe('Filter 3 — circular-flow cycle detection (net-new)', () => {
  it('drops a payer that is funded by and routes back to the service (cycle)', async () => {
    // farmCircular ↔ serviceHoneyjar form a cycle in SYNTHETIC_GRAPH.
    const rows = [
      row({ agent_id: 'svc', payer_address: ADDR.farmCircular, actual_micro: 20n * DOLLAR, tx_hash: '0xcirc' }),
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 20n * DOLLAR, tx_hash: '0xok' }),
    ];
    const res = await computeServiceRevenue('svc', depsFor(rows));
    expect(res.methodology.breakdown.dropped_circular_micro).toBe((20n * DOLLAR).toString());
    expect(res.qualified_micro).toBe(20n * DOLLAR); // only the clean one survives
    expect(res.methodology.breakdown.circular_payers).toBe(1);
  });
});

describe('Filters 4-5 — diagnostics only (OPEN-5: NOT in the headline)', () => {
  it('age + origin change confidence_weighted, NOT the headline score', async () => {
    const rows = [
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 100n * DOLLAR, tx_hash: '0xext' }),
    ];
    const res = await computeServiceRevenue('svc', depsFor(rows));
    // Headline: nothing dropped → score 1.0 regardless of weights.
    expect(res.score).toBe(1);
    expect(res.qualified_micro).toBe(100n * DOLLAR);
    // Diagnostic weighted sum reflects age (60d → full) × external-origin bonus (1.25).
    const weighted = BigInt(res.methodology.breakdown.confidence_weighted_qualified_micro);
    expect(weighted).toBeGreaterThan(100n * DOLLAR); // up-weighted by external origin
  });
});

describe('Headline score ∈ [0,1] and reproducible from binary gates', () => {
  it('score is qualified/raw and clamped to [0,1]', async () => {
    const rows = [
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 25n * DOLLAR, tx_hash: '0xa' }),
      row({ agent_id: 'svc', payer_address: ADDR.farmCircular, actual_micro: 75n * DOLLAR, tx_hash: '0xb' }),
    ];
    const res = await computeServiceRevenue('svc', depsFor(rows));
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(1);
    expect(res.score).toBeCloseTo(0.25, 10); // 25 of 100 survives
  });
});

describe('Determinism (Assertion D precursor) — byte-identical reruns', () => {
  it('same inputs → identical JSON output across two independent runs', async () => {
    const rows = [
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 10n * DOLLAR, tx_hash: '0x1' }),
      row({ agent_id: 'svc', payer_address: ADDR.farmCircular, actual_micro: 10n * DOLLAR, tx_hash: '0x2' }),
      row({ agent_id: 'svc', payer_address: ADDR.farmDust, actual_micro: 1n, tx_hash: '0x3' }),
    ];
    const serialize = (r: ServiceRevenue): string =>
      JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

    // Two independent provider+deps instances, same graph + asOf.
    const a = await computeServiceRevenue('svc', depsFor(rows));
    const b = await computeServiceRevenue('svc', depsFor(rows));
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('Farm reduces score / clean survives (success metric, sprint.md:180)', () => {
  it('adding farm-like wallets lowers the score; clean-only stays high', async () => {
    const cleanOnly = [
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedCex, actual_micro: 50n * DOLLAR, tx_hash: '0xc1' }),
      row({ agent_id: 'svc', payer_address: ADDR.cleanAgedBridge, actual_micro: 50n * DOLLAR, tx_hash: '0xc2' }),
    ];
    const withFarm = [
      ...cleanOnly,
      row({ agent_id: 'svc', payer_address: ADDR.farmCircular, actual_micro: 100n * DOLLAR, tx_hash: '0xf1' }), // circular
      row({ agent_id: 'svc', payer_address: ADDR.farmDust, actual_micro: 5n, tx_hash: '0xf2' }), // dust
    ];
    const clean = await computeServiceRevenue('svc', depsFor(cleanOnly));
    const farmed = await computeServiceRevenue('svc', depsFor(withFarm));

    expect(clean.score).toBe(1); // all clean revenue survives
    expect(farmed.score).toBeLessThan(clean.score); // farm demonstrably reduces score
    // clean revenue still fully present in the farmed run's qualified total
    expect(farmed.qualified_micro).toBe(100n * DOLLAR);
  });
});

describe('Anti-self-grading is uniform across services', () => {
  it('every agent_id is indexed and scored by the same filters', async () => {
    const rows = [
      row({ agent_id: 'third-party', payer_address: ADDR.cleanAgedCex, actual_micro: 10n * DOLLAR, tx_hash: '0xtp' }),
      row({ agent_id: 'honeyjar', payer_address: ADDR.affiliatePayer, actual_micro: 10n * DOLLAR, tx_hash: '0xhj' }),
    ];
    const deps = depsFor(rows, {
      affiliateAllowlist: new Set([normalizeAddress(ADDR.affiliatePayer)]),
    });
    const all = await computeAllServices(deps);
    expect(all.map((r) => r.agent_id)).toEqual(['honeyjar', 'third-party']); // both indexed, sorted
    const hj = all.find((r) => r.agent_id === 'honeyjar')!;
    expect(hj.qualified_micro).toBe(0n); // affiliated → headline excluded
    expect(hj.flagged_affiliated_micro).toBe(10n * DOLLAR);
  });
});
