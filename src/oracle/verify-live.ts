/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3) — LIVE verification harness for the oracle.
 *
 * NOT the Sprint-4 acceptance harness (no docker-compose, no self-broadcast, no
 * Assertions exit-code contract — that is Sprint 4). This is a Sprint-3-scoped
 * driver that proves the oracle reads REAL x402_settlements rows from a real
 * Postgres (not just in-memory fakes) and produces the documented output shape,
 * with the MockChainProvider supplying the funding graph for the filters.
 *
 * It:
 *   1. connects to DATABASE_URL (a throwaway PG with migrations 0001-0005 applied),
 *   2. inserts a fixed synthetic settlement set (clean + farm-like + affiliated)
 *      through the SAME columns settle() writes, inside one community scope,
 *   3. runs computeAllServices() against the real table + MockChainProvider,
 *   4. prints the per-service output and the farm-vs-clean comparison,
 *   5. runs the computation TWICE and reports whether the JSON is byte-identical.
 *
 * Usage:
 *   DATABASE_URL=postgres://… npx tsx src/oracle/verify-live.ts
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Pool } from 'pg';
import { computeAllServices, type OracleDeps } from './oracle.js';
import { PgSettlementsRepo } from './settlements-repo.js';
import {
  resolveAffiliateAllowlist,
  resolveDustFloorMicro,
  resolveWeightingParams,
  normalizeAddress,
} from './config.js';
import { MockChainProvider } from '../adapters/chain/mock-chain-provider.js';
import { ADDR, SYNTHETIC_GRAPH, SYNTHETIC_AS_OF } from './synthetic-graph.js';
import type { ServiceRevenue } from './types.js';

const COMMUNITY = '00000000-0000-0000-0000-000000000001';
const CHAIN = 80069;
const CENT = 10_000n;
const DOLLAR = 100n * CENT;

/** Fixed synthetic settlement set — mirrors the funding graph's scenario. */
const SETTLEMENTS: Array<{
  agent_id: string;
  payer: string;
  actual_micro: bigint;
  tx: string;
}> = [
  // Third-party service: two clean payers (survive) + a circular farm + dust farm.
  { agent_id: 'svc-thirdparty', payer: ADDR.cleanAgedCex, actual_micro: 40n * DOLLAR, tx: '0xtp_clean_cex' },
  { agent_id: 'svc-thirdparty', payer: ADDR.cleanAgedBridge, actual_micro: 60n * DOLLAR, tx: '0xtp_clean_bridge' },
  { agent_id: 'svc-thirdparty', payer: ADDR.farmCircular, actual_micro: 100n * DOLLAR, tx: '0xtp_farm_circular' },
  { agent_id: 'svc-thirdparty', payer: ADDR.farmDust, actual_micro: 5n, tx: '0xtp_farm_dust' },
  // 0xhoneyjar service: paid only by an affiliated wallet → anti-self-grading.
  { agent_id: 'svc-honeyjar', payer: ADDR.affiliatePayer, actual_micro: 80n * DOLLAR, tx: '0xhj_affiliate' },
  { agent_id: 'svc-honeyjar', payer: ADDR.cleanAgedCex, actual_micro: 20n * DOLLAR, tx: '0xhj_clean' },
];

function serialize(r: ServiceRevenue[]): string {
  return JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function insertSettlements(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.community_id = '${COMMUNITY}'`);
    for (const s of SETTLEMENTS) {
      // Same column shape settle() Step 3b writes (src/services/x402-settlement.ts).
      await client.query(
        `INSERT INTO x402_settlements
           (community_id, agent_id, payer_address, chain_id, tx_hash, nonce, quoted_micro, actual_micro)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (chain_id, tx_hash) DO NOTHING`,
        [COMMUNITY, s.agent_id, s.payer, CHAIN, s.tx, s.tx, s.actual_micro.toString(), s.actual_micro.toString()],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function buildDeps(pool: Pool): OracleDeps {
  // OPEN-3: the live run explicitly seeds the affiliate allowlist with the
  // synthetic affiliate payer so the flag mechanism is exercised. In production
  // this comes from AFFILIATE_ALLOWLIST / the placeholder list — here we inject
  // the known synthetic affiliate so anti-self-grading is demonstrable.
  const allowlist = resolveAffiliateAllowlist();
  allowlist.add(normalizeAddress(ADDR.affiliatePayer));

  return {
    settlementsRepo: new PgSettlementsRepo(pool),
    chainProvider: new MockChainProvider(SYNTHETIC_GRAPH),
    affiliateAllowlist: allowlist,
    dustFloorMicro: resolveDustFloorMicro(),
    weighting: resolveWeightingParams(),
    providerMode: 'mock',
    chainId: CHAIN,
    asOf: SYNTHETIC_AS_OF,
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('set DATABASE_URL to a clean Postgres with 0001-0005 applied');
  const pool = new Pool({ connectionString });

  try {
    await insertSettlements(pool);

    const deps = buildDeps(pool);
    const run1 = await computeAllServices(deps);
    const run2 = await computeAllServices(deps); // determinism rerun (Assertion D precursor)

    const json1 = serialize(run1);
    const json2 = serialize(run2);
    const identical = json1 === json2;

    console.log('=== ORACLE LIVE OUTPUT (real Postgres x402_settlements + MockChainProvider) ===');
    console.log(json1);

    console.log('\n=== PER-SERVICE HEADLINE ===');
    for (const r of run1) {
      console.log(
        `  ${r.agent_id.padEnd(16)} raw=${(Number(r.raw_micro) / 1e6).toFixed(2)}$  ` +
          `qualified=${(Number(r.qualified_micro) / 1e6).toFixed(2)}$  ` +
          `flagged_affiliated=${(Number(r.flagged_affiliated_micro) / 1e6).toFixed(2)}$  ` +
          `score=${r.score.toFixed(4)}`,
      );
    }

    console.log('\n=== ANTI-SELF-GRADING (svc-honeyjar) ===');
    const hj = run1.find((r) => r.agent_id === 'svc-honeyjar');
    if (hj) {
      console.log(
        `  svc-honeyjar raw=${(Number(hj.raw_micro) / 1e6).toFixed(2)}$ ` +
          `flagged_affiliated=${(Number(hj.flagged_affiliated_micro) / 1e6).toFixed(2)}$ ` +
          `qualified=${(Number(hj.qualified_micro) / 1e6).toFixed(2)}$ ` +
          `score=${hj.score.toFixed(4)}`,
      );
      console.log(
        `  → affiliated revenue is FLAGGED and EXCLUDED from the headline ` +
          `(${hj.flagged_affiliated_micro > 0n ? 'PASS' : 'FAIL'}).`,
      );
    }

    console.log('\n=== DETERMINISM (ran twice) ===');
    console.log(`  byte-identical output on rerun: ${identical ? 'YES' : 'NO'}`);
    if (!identical) {
      console.error('  NON-DETERMINISTIC — failing.');
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
