/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 4, Task 4.3, FR-6) — acceptance verdict harness.
 *
 * `pnpm verify` — the objective, on-one-screen pass/fail an external tester
 * reads as a verdict (ROLE3-ORACLE-SPEC.md §10.4 / sdd.md §7.3). It:
 *   1. reads the REAL x402_settlements rows that `pnpm seed:bepolia` wrote
 *      (through settle(), NOT direct inserts) from DATABASE_URL,
 *   2. runs the REAL oracle (computeAllServices) over them, with the keyless
 *      MockChainProvider supplying the §5 funding graph,
 *   3. prints the per-service Raw / Qualified / flagged-affiliated / score table,
 *   4. checks the four machine-checkable assertions, and
 *   5. exits 0 iff all evaluable assertions pass (non-zero + diff on failure).
 *
 * THE ASSERTIONS (sprint.md:203, ROLE3-ORACLE-SPEC.md:303-308):
 *   A  farm-like wallets' revenue is EXCLUDED from Qualified (no leak into the
 *      headline) — checked against the REAL oracle output, never a hardcoded
 *      number: expected-clean is derived from scripts/scenario.ts.
 *   B  clean / external-funded wallets SURVIVE into Qualified (no clean dollar
 *      dropped).
 *   C  every COUNTED tx_hash RESOLVES on the public Bepolia explorer's chain
 *      (eth_getTransactionByHash via BEPOLIA_RPC_URL). In keyless mock mode the
 *      counted hashes are synthetic `mock:` labels that do NOT resolve, so C is
 *      reported TESTER-REQUIRED — explicitly, never faked to green.
 *   D  re-running the computation is DETERMINISTIC (byte-identical output).
 *
 * EXIT CODE: 0 iff A, B, D pass AND C is not a hard FAIL. A TESTER-REQUIRED C
 * (mock mode, no chain to read) does NOT fail the run — the spec's no-secret
 * fallback (§10.5) makes the live explorer leg the one that needs a key. A, B, D
 * are keyless and MUST pass in mock. If C is evaluable (rpc/dune) and a counted
 * tx does not resolve, that IS a failure and the exit code is non-zero.
 *
 * mock = filter logic (the meter); dune = real data; rpc = live self-broadcast.
 * The MockChainProvider fabricates no claim about real Bepolia revenue — it only
 * feeds the FILTER LOGIC a known graph so we can grade farm-vs-clean keyless.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Pool } from 'pg';
import { computeAllServices, type OracleDeps } from '../src/oracle/oracle.js';
import { PgSettlementsRepo } from '../src/oracle/settlements-repo.js';
import { profilePayers } from '../src/oracle/funding-graph.js';
import {
  resolveAffiliateAllowlist,
  resolveDustFloorMicro,
  resolveWeightingParams,
  normalizeAddress,
} from '../src/oracle/config.js';
import { MockChainProvider } from '../src/adapters/chain/mock-chain-provider.js';
import type { ServiceRevenue, PayerProfile } from '../src/oracle/types.js';
import {
  SCENARIO,
  SCENARIO_AFFILIATES,
  COMMUNITY,
  CHAIN_ID,
  isCleanRole,
  SYNTHETIC_GRAPH,
  SYNTHETIC_AS_OF,
} from './scenario.js';

type Mode = 'mock' | 'rpc' | 'dune';
type AssertionStatus = 'PASS' | 'FAIL' | 'TESTER_REQUIRED';

interface AssertionResult {
  id: 'A' | 'B' | 'C' | 'D';
  label: string;
  status: AssertionStatus;
  detail: string;
}

function resolveMode(): Mode {
  const raw = (process.env.CHAIN_PROVIDER ?? 'mock').toLowerCase();
  if (raw === 'rpc') return 'rpc';
  if (raw === 'dune' || raw === 'dune_sim') return 'dune';
  return 'mock';
}

function dbUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgres://arcturus:arcturus@localhost:5544/arcturus'
  );
}

/** Stable JSON (bigint → string) for the determinism comparison (Assertion D). */
function serialize(r: ServiceRevenue[]): string {
  return JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

function usd(micro: bigint): string {
  return `$${(Number(micro) / 1e6).toFixed(6)}`;
}

/**
 * Build the oracle deps exactly as the seed wrote the data:
 *   - real settlements read from Postgres (PgSettlementsRepo),
 *   - keyless MockChainProvider over the SAME synthetic funding graph the seed
 *     used (ROLE3-ORACLE-SPEC.md §10.5),
 *   - the synthetic affiliate injected into the allowlist so anti-self-grading
 *     is demonstrable regardless of AFFILIATE_ALLOWLIST (matches the seed and
 *     src/oracle/verify-live.ts; config.ts placeholders match no real payer).
 */
function buildDeps(pool: Pool, mode: Mode): OracleDeps {
  const allowlist = resolveAffiliateAllowlist();
  for (const a of SCENARIO_AFFILIATES) allowlist.add(normalizeAddress(a));

  return {
    settlementsRepo: new PgSettlementsRepo(pool),
    chainProvider: new MockChainProvider(SYNTHETIC_GRAPH),
    affiliateAllowlist: allowlist,
    dustFloorMicro: resolveDustFloorMicro(),
    weighting: resolveWeightingParams(),
    providerMode: mode,
    chainId: CHAIN_ID,
    asOf: SYNTHETIC_AS_OF,
  };
}

/** One x402_settlements row, as the oracle reads it. */
interface DbSettlement {
  agent_id: string;
  payer_address: string;
  tx_hash: string;
  actual_micro: bigint;
}

async function readSettlements(pool: Pool): Promise<DbSettlement[]> {
  const res = await pool.query<{
    agent_id: string;
    payer_address: string;
    tx_hash: string;
    actual_micro: string;
  }>(
    `SELECT agent_id, payer_address, tx_hash, actual_micro
       FROM x402_settlements
      ORDER BY agent_id ASC, tx_hash ASC`,
  );
  return res.rows.map((r) => ({
    agent_id: r.agent_id,
    payer_address: r.payer_address,
    tx_hash: r.tx_hash,
    actual_micro: BigInt(r.actual_micro),
  }));
}

/**
 * Decide whether a single settlement is COUNTED (qualified) by the meter.
 *
 * Mirrors src/oracle/oracle.ts::classify gate order (affiliate → dust →
 * circular) so verify can list the exact tx_hashes that fed the headline (the
 * counted-hash list for Assertion C). This local mirror is cross-checked inside
 * Assertion A: per service, Σ(counted actual_micro) MUST equal the oracle's own
 * qualified_micro. If the mirror ever drifts from the oracle's gate logic, that
 * equality breaks and Assertion A FAILS (exit 1) — so the counted-hash list can
 * never silently diverge from what the headline actually counted.
 */
function isCounted(
  s: DbSettlement,
  profile: PayerProfile,
  deps: OracleDeps,
): boolean {
  const payer = normalizeAddress(s.payer_address);
  if (deps.affiliateAllowlist.has(payer)) return false; // Filter 1
  if (s.actual_micro < deps.dustFloorMicro) return false; // Filter 2
  if (profile.isCircular) return false; // Filter 3
  return true;
}

/** Sum a predicate-filtered slice of micro-amounts. */
function sumMicro(rows: DbSettlement[], pred: (s: DbSettlement) => boolean): bigint {
  return rows.reduce((acc, s) => (pred(s) ? acc + s.actual_micro : acc), 0n);
}

// ---------------------------------------------------------------------------
// Assertion C — explorer / on-chain resolution
// ---------------------------------------------------------------------------

/** Is this a real on-chain hash (vs a synthetic `mock:` label)? */
function isRealTxHash(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash);
}

/**
 * Resolve a tx_hash on-chain via JSON-RPC eth_getTransactionByHash (Node 22
 * global fetch — no web3 dependency, so the keyless path stays dependency-free).
 * The public Bepolia explorer (https://bepolia.beratrail.io) indexes the same
 * chain BEPOLIA_RPC_URL reads, so a tx the RPC confirms is a tx the tester can
 * open in the explorer. Returns true iff the node returns a non-null result.
 */
async function resolvesOnChain(rpcUrl: string, txHash: string): Promise<boolean> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionByHash',
      params: [txHash],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${rpcUrl} returned HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message ?? 'unknown'}`);
  return json.result != null; // null = not found on chain
}

async function checkAssertionC(
  mode: Mode,
  countedHashes: string[],
): Promise<AssertionResult> {
  const id = 'C' as const;
  const label = 'every counted tx_hash resolves on the Bepolia explorer';
  const rpcUrl = process.env.BEPOLIA_RPC_URL?.trim();

  // Keyless mock: the counted hashes are synthetic `mock:` labels by design —
  // they prove the METER, not the chain. We do NOT fake explorer resolution.
  const allSynthetic = countedHashes.every((h) => !isRealTxHash(h));
  if (mode === 'mock' || allSynthetic) {
    return {
      id,
      label,
      status: 'TESTER_REQUIRED',
      detail:
        `mock mode: ${countedHashes.length} counted tx_hash(es) are synthetic ` +
        `(${countedHashes.slice(0, 3).join(', ')}${countedHashes.length > 3 ? ', …' : ''}) ` +
        `and do NOT resolve on https://bepolia.beratrail.io. Run CHAIN_PROVIDER=rpc ` +
        `with BEPOLIA_RPC_URL + a faucet-funded SEED_PRIVATE_KEY to broadcast real ` +
        `txs and evaluate C live. (mock = filter logic; dune = real data.)`,
    };
  }

  // Live mode but no RPC to read the chain with → cannot evaluate honestly.
  if (!rpcUrl) {
    return {
      id,
      label,
      status: 'TESTER_REQUIRED',
      detail:
        `${countedHashes.length} real counted tx_hash(es) present but BEPOLIA_RPC_URL ` +
        `is unset, so on-chain resolution cannot be checked here. Set BEPOLIA_RPC_URL ` +
        `(e.g. https://bepolia.rpc.berachain.com) to evaluate C live.`,
    };
  }

  // Live: resolve every counted tx against the chain. Any miss is a hard FAIL.
  const unresolved: string[] = [];
  for (const h of countedHashes) {
    try {
      if (!(await resolvesOnChain(rpcUrl, h))) unresolved.push(h);
    } catch (e) {
      return {
        id,
        label,
        status: 'TESTER_REQUIRED',
        detail:
          `could not reach BEPOLIA_RPC_URL to verify ${countedHashes.length} tx(es): ` +
          `${e instanceof Error ? e.message : String(e)}. Check the RPC URL/connectivity.`,
      };
    }
  }
  if (unresolved.length > 0) {
    return {
      id,
      label,
      status: 'FAIL',
      detail:
        `${unresolved.length}/${countedHashes.length} counted tx_hash(es) did NOT resolve ` +
        `on-chain: ${unresolved.join(', ')}. A counted tx that is not on-chain is fabricated revenue.`,
    };
  }
  return {
    id,
    label,
    status: 'PASS',
    detail:
      `all ${countedHashes.length} counted tx_hash(es) resolve on-chain via ${rpcUrl} ` +
      `(open each on https://bepolia.beratrail.io to confirm independently).`,
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = resolveMode();
  const pool = new Pool({ connectionString: dbUrl() });

  const results: AssertionResult[] = [];

  try {
    const deps = buildDeps(pool, mode);

    // --- Run the real oracle TWICE (Assertion D is the byte-identical rerun) --
    const run1 = await computeAllServices(deps);
    const run2 = await computeAllServices(deps);
    const json1 = serialize(run1);
    const json2 = serialize(run2);
    const deterministic = json1 === json2;

    // --- Per-service verdict table -----------------------------------------
    console.log(`=== pnpm verify (mode=${mode}) — Proof-of-Revenue Oracle acceptance verdict ===`);
    console.log(`DB: ${dbUrl().replace(/:\/\/[^@]*@/, '://***@')}  community: ${COMMUNITY}  chain: ${CHAIN_ID}\n`);
    console.log('Per-service Raw / Qualified / flagged-affiliated / realness score:');
    console.log('  ' + 'service'.padEnd(16) + 'raw'.padStart(16) + 'qualified'.padStart(16) + 'flagged_aff'.padStart(16) + '  score');
    for (const r of run1) {
      console.log(
        '  ' +
          r.agent_id.padEnd(16) +
          usd(r.raw_micro).padStart(16) +
          usd(r.qualified_micro).padStart(16) +
          usd(r.flagged_affiliated_micro).padStart(16) +
          `  ${r.score.toFixed(4)}`,
      );
    }
    console.log();

    if (run1.length === 0) {
      console.error(
        'No settlements found. Run `pnpm seed:bepolia` first (the acceptance flow is\n' +
          '`pnpm seed:bepolia && pnpm verify`). Aborting with no assertions evaluated.',
      );
      process.exitCode = 1;
      return;
    }

    // --- Read the real rows + profile payers for the per-tx determination ---
    const settlements = await readSettlements(pool);
    const payerAddrs = [...new Set(settlements.map((s) => normalizeAddress(s.payer_address)))];
    const profiles = await profilePayers(payerAddrs, deps.chainId, deps.chainProvider, deps.asOf);
    const profileFor = (addr: string): PayerProfile =>
      profiles.get(normalizeAddress(addr)) ?? {
        address: normalizeAddress(addr),
        firstSeen: null,
        ageDays: 0,
        isCircular: false,
        circularWith: [],
        hasExternalOrigin: false,
      };

    // Map DB rows → scenario role by tx_hash (mock writes tx_hash = `mock:${s.tx}`).
    const roleByTx = new Map<string, string>();
    const cleanTxs = new Set<string>();
    for (const sc of SCENARIO) {
      const mockHash = `mock:${sc.tx}`;
      roleByTx.set(mockHash, sc.role);
      if (isCleanRole(sc.role)) cleanTxs.add(mockHash);
    }
    const isScenarioClean = (s: DbSettlement): boolean => cleanTxs.has(s.tx_hash);

    // --- Assertion A — farm-like revenue EXCLUDED from Qualified -------------
    // Per service: the oracle's qualified_micro must not exceed the sum of the
    // scenario's clean-role settlements (no farm / dust / affiliate leaked in).
    // Derived from the REAL oracle output vs the scenario classification — never
    // a hardcoded number. In mock the scenario roles are known; in live modes
    // (single self-broadcast key, no funding graph for real addrs) farm-vs-clean
    // scoring needs Dune (CHAIN_PROVIDER=dune), so A is tester-required there.
    const mockTxsPresent = settlements.some((s) => roleByTx.has(s.tx_hash));
    if (mode === 'mock' || mockTxsPresent) {
      const aFailures: string[] = [];
      const bFailures: string[] = [];
      const mirrorFailures: string[] = [];
      for (const r of run1) {
        const svcRows = settlements.filter((s) => s.agent_id === r.agent_id);
        const cleanSum = sumMicro(svcRows, isScenarioClean);
        const excess = r.qualified_micro - cleanSum; // >0 ⇒ farm leaked into headline
        const shortfall = cleanSum - r.qualified_micro; // >0 ⇒ a clean dollar was dropped
        if (excess > 0n) {
          aFailures.push(
            `${r.agent_id}: qualified ${usd(r.qualified_micro)} > clean-only ${usd(cleanSum)} (+${usd(excess)} farm leaked)`,
          );
        }
        if (shortfall > 0n) {
          bFailures.push(
            `${r.agent_id}: qualified ${usd(r.qualified_micro)} < clean-only ${usd(cleanSum)} (−${usd(shortfall)} clean dropped)`,
          );
        }
        // Mirror cross-check: the local isCounted() mirror of oracle.ts::classify
        // (which selects the counted tx_hashes for Assertion C) MUST agree with the
        // oracle's own qualified_micro per service. If the mirror ever drifts from
        // the oracle's gate logic, this equality breaks and the run fails — so the
        // counted-hash list verify reports can never silently diverge from what the
        // headline actually counted.
        const countedSum = sumMicro(svcRows, (s) => isCounted(s, profileFor(s.payer_address), deps));
        if (countedSum !== r.qualified_micro) {
          mirrorFailures.push(
            `${r.agent_id}: isCounted Σ ${usd(countedSum)} ≠ oracle qualified ${usd(r.qualified_micro)} (classify mirror drift)`,
          );
        }
      }
      // Strengthen A: the farm/dust/affiliate revenue must be ACCOUNTED for as
      // dropped/flagged in the breakdown, not merely absent — proves exclusion
      // happened via the documented filters.
      const totalFarmMicro = sumMicro(settlements, (s) => roleByTx.has(s.tx_hash) && !isScenarioClean(s));
      const totalAccounted = run1.reduce((acc, r) => {
        const b = r.methodology.breakdown;
        return (
          acc +
          BigInt(b.flagged_affiliated_micro) +
          BigInt(b.dropped_dust_micro) +
          BigInt(b.dropped_circular_micro)
        );
      }, 0n);
      const farmAccountedFor = totalAccounted >= totalFarmMicro && totalFarmMicro > 0n;

      const aPass = aFailures.length === 0 && farmAccountedFor && mirrorFailures.length === 0;
      results.push({
        id: 'A',
        label: 'farm-like wallets excluded from Qualified',
        status: aPass ? 'PASS' : 'FAIL',
        detail: aPass
          ? `no farm/dust/affiliate revenue leaked into any service's Qualified; ` +
            `${usd(totalFarmMicro)} farm-like revenue accounted as dropped+flagged ` +
            `(${usd(totalAccounted)} via filters 1-3); isCounted mirror Σ == oracle qualified per service.`
          : [...aFailures, ...mirrorFailures].join('; '),
      });
      results.push({
        id: 'B',
        label: 'clean / external-funded wallets survive into Qualified',
        status: bFailures.length === 0 ? 'PASS' : 'FAIL',
        detail:
          bFailures.length === 0
            ? `every clean-role settlement's revenue is counted in its service's Qualified.`
            : bFailures.join('; '),
      });
    } else {
      const taDetail =
        `live mode with non-scenario payers: farm-vs-clean scoring on REAL addresses ` +
        `needs the funding-graph data getActivity exposes (Dune-Sim-exclusive). Run ` +
        `CHAIN_PROVIDER=dune to evaluate A/B on real data; mock proves them keyless.`;
      results.push({ id: 'A', label: 'farm-like wallets excluded from Qualified', status: 'TESTER_REQUIRED', detail: taDetail });
      results.push({ id: 'B', label: 'clean / external-funded wallets survive into Qualified', status: 'TESTER_REQUIRED', detail: taDetail });
    }

    // --- Assertion C — counted tx_hashes resolve on the explorer's chain -----
    // Counted = settlements the meter qualified (passed all three binary gates).
    const countedHashes = settlements
      .filter((s) => isCounted(s, profileFor(s.payer_address), deps))
      .map((s) => s.tx_hash)
      .sort();
    results.push(await checkAssertionC(mode, countedHashes));

    // --- Assertion D — deterministic rerun ----------------------------------
    results.push({
      id: 'D',
      label: 're-running verify is deterministic (same inputs → same scores)',
      status: deterministic ? 'PASS' : 'FAIL',
      detail: deterministic
        ? 'byte-identical oracle output across two in-process runs (no wall-clock in scoring path).'
        : 'NON-DETERMINISTIC: oracle output differed between two runs over the same data.',
    });

    // --- Verdict ------------------------------------------------------------
    console.log('Assertions:');
    for (const a of results) {
      const mark = a.status === 'PASS' ? '✓ PASS' : a.status === 'FAIL' ? '✗ FAIL' : '◐ TESTER-REQUIRED';
      console.log(`  [${a.id}] ${mark}  ${a.label}`);
      console.log(`        ${a.detail}`);
    }
    console.log();

    // Exit non-zero iff any assertion hard-FAILs. TESTER_REQUIRED (C in mock; A/B
    // in live-without-dune) does NOT fail — the spec's §10.5 no-secret fallback
    // makes the live/real-data legs the ones that need a key. A, B, D are keyless
    // and MUST pass in mock.
    const failed = results.filter((a) => a.status === 'FAIL');
    const testerRequired = results.filter((a) => a.status === 'TESTER_REQUIRED');
    if (failed.length > 0) {
      console.error(`VERDICT: FAIL — ${failed.map((a) => a.id).join(', ')} failed. Exit 1.`);
      process.exitCode = 1;
      return;
    }
    if (testerRequired.length > 0) {
      console.log(
        `VERDICT: PASS (keyless legs) — A/B/D evaluated; ` +
          `${testerRequired.map((a) => a.id).join(', ')} TESTER-REQUIRED (need a live chain/Dune key). Exit 0.`,
      );
    } else {
      console.log('VERDICT: PASS — all assertions (A, B, C, D) passed. Exit 0.');
    }
    process.exitCode = 0;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('\nverify FAILED:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
