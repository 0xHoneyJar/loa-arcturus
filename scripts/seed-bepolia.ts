/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 4, Task 4.2, FR-6) — reproducible seed script.
 *
 * `pnpm seed:bepolia` — the scenario the TESTER triggers themselves so they
 * watch it happen rather than inheriting a pre-baked DB (ROLE3-ORACLE-SPEC.md
 * §10.3 / sdd.md §7.2). It:
 *   - sets up clean + farm-like (+ affiliate) payers from scripts/scenario.ts,
 *   - writes every resulting proof through the REAL settle() path
 *     (src/services/x402-settlement.ts) — NOT direct table inserts, so the same
 *     quote→mint→usage_event→x402_settlements→debit flow that production uses is
 *     exercised, and payer_address = the on-chain `from` is persisted (THE GAP),
 *   - prints every tx_hash for explorer verification (Assertion C).
 *
 * TWO MODES (mock = filter logic; dune/rpc = real data):
 *
 *   CHAIN_PROVIDER=mock (default, KEYLESS):
 *     The synthetic scenario is written via settle() with the synthetic tx
 *     labels + synthetic on-chain `from`. The MockChainProvider (verify.ts)
 *     serves the SAME funding graph, so the §5 filters run end-to-end and the
 *     result is deterministic. The printed tx_hashes are clearly labelled
 *     `mock:` — they do NOT resolve on the explorer (Assertion C is therefore
 *     tester-required; mock proves the METER, not the chain). Nothing is faked
 *     to look like a real on-chain hash.
 *
 *   CHAIN_PROVIDER=rpc (LIVE, tester supplies BEPOLIA_RPC_URL + SEED_PRIVATE_KEY):
 *     The tester's OWN throwaway, faucet-funded key SELF-BROADCASTS a real
 *     transfer per settlement on Bepolia (80069). on-chain `from` == the real
 *     payer (the anti-sybil trust anchor — no managed relayer, no thirdweb). The
 *     server READS the chain (eth_getTransactionByHash) to CONFIRM each tx
 *     before counting it (SDD §5.4 / loa-arcturus-7bi), then writes the proof
 *     through settle(). Every real tx_hash is printed for the Bepolia explorer.
 *     viem is loaded via dynamic import so the keyless mock path never needs it.
 *
 * Self-broadcast realism caveat (honest scoping): a tester normally funds ONE
 * throwaway key. We broadcast all settlements FROM that key (on-chain `from`
 * stays the real signer). Classifying farm-vs-clean on REAL addresses needs the
 * funding-graph data exposed by getActivity, which is Dune-Sim-exclusive
 * (ROLE3-ORACLE-SPEC.md §11) — so the live legs prove "real tx persisted via
 * settle() + explorer-resolvable" (G-1/Assertion C on a real chain), while the
 * farm-vs-clean SCORE (Assertions A/B) is proven keyless in mock and on real
 * data only in CHAIN_PROVIDER=dune. The README states this split plainly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { settle, type X402PaymentProof } from '../src/services/x402-settlement.js';
import { SCENARIO, COMMUNITY, CHAIN_ID, type ScenarioSettlement } from './scenario.js';

type Mode = 'mock' | 'rpc' | 'dune';

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

function redisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6399';
}

/**
 * Build an ioredis client that FAILS FAST instead of hanging when Redis is
 * unreachable — settle()'s Redis budget step is best-effort (try/catch), so a
 * fast failure is swallowed and the DB writes (the part the oracle reads) still
 * happen. We attach an error handler so an unreachable Redis can never crash the
 * process via an unhandled 'error' event.
 */
function makeRedis(): Redis {
  const client = new Redis(redisUrl(), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    retryStrategy: () => null, // do not retry forever; fail fast
    lazyConnect: false,
  });
  client.on('error', () => {
    /* best-effort: settle() tolerates Redis being down */
  });
  return client;
}

/** True if the error means "this settlement is already present" (re-run safe). */
function isAlreadySeeded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /already settled/i.test(msg) ||
    /nonce replay/i.test(msg) ||
    /duplicate key/i.test(msg) ||
    /x402_settlements_chain_tx_uq/i.test(msg) ||
    /unique constraint/i.test(msg)
  );
}

/** Drive one scenario settlement through the REAL settle() path. */
async function settleOne(
  pool: Pool,
  redis: Redis,
  s: ScenarioSettlement,
  payerFrom: string,
  txHash: string,
): Promise<'settled' | 'already'> {
  const proof: X402PaymentProof = {
    tx_hash: txHash,
    chain_id: CHAIN_ID,
    from: payerFrom, // the on-chain payer — persisted by settle() Step 3b (THE GAP)
    amount_micro: s.actual_micro,
    nonce: txHash, // one nonce per tx (matches the per-settlement dedup model)
    agent_id: s.agent_id,
    community_id: COMMUNITY,
  };
  try {
    // quoted == actual → no remainder; a valid conservative-quote-settle run.
    await settle(pool, redis, proof, s.actual_micro, s.actual_micro, `seed:${txHash}`);
    return 'settled';
  } catch (err) {
    if (isAlreadySeeded(err)) return 'already';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mock mode — keyless, synthetic, deterministic
// ---------------------------------------------------------------------------

async function seedMock(pool: Pool, redis: Redis): Promise<void> {
  console.log('=== seed:bepolia (MODE=mock, KEYLESS) ===');
  console.log('Writing the synthetic scenario through the REAL settle() path.');
  console.log('mock = filter logic (the meter); dune = real data. See README.\n');

  let settled = 0;
  let already = 0;
  for (const s of SCENARIO) {
    // In mock, the synthetic tx label IS the tx hash, prefixed mock: so nobody
    // mistakes it for a real on-chain hash. The synthetic payer IS the `from`.
    const txHash = `mock:${s.tx}`;
    const outcome = await settleOne(pool, redis, s, s.payer, txHash);
    outcome === 'settled' ? settled++ : already++;
    console.log(
      `  [${s.role.padEnd(13)}] ${s.agent_id.padEnd(15)} ` +
        `$${(Number(s.actual_micro) / 1e6).toFixed(6).padStart(10)}  ` +
        `from=${s.payer}  tx_hash=${txHash}  (${outcome})`,
    );
  }

  console.log(
    `\nSeeded ${settled} new settlement(s)` +
      (already ? `, ${already} already present (re-run safe).` : '.'),
  );
  console.log(
    'Assertion C (explorer resolution) is TESTER-REQUIRED in mock: these are\n' +
      'synthetic `mock:` tx_hashes and do NOT resolve on https://bepolia.beratrail.io.\n' +
      'Run CHAIN_PROVIDER=rpc with a funded throwaway key to broadcast real txs.',
  );
}

// ---------------------------------------------------------------------------
// Live mode — real self-broadcast on Bepolia 80069 (tester-supplied key)
// ---------------------------------------------------------------------------

async function seedLive(pool: Pool, redis: Redis, mode: 'rpc' | 'dune'): Promise<void> {
  console.log(`=== seed:bepolia (MODE=${mode}, LIVE self-broadcast on Bepolia ${CHAIN_ID}) ===`);

  const rpcUrl = process.env.BEPOLIA_RPC_URL?.trim();
  const pk = process.env.SEED_PRIVATE_KEY?.trim();
  if (!rpcUrl || !pk) {
    throw new Error(
      'LIVE mode needs BEPOLIA_RPC_URL + SEED_PRIVATE_KEY (a throwaway, faucet-funded\n' +
        'key — https://bepolia.faucet.berachain.com). Set them in .env, or use the\n' +
        'keyless path with CHAIN_PROVIDER=mock. Nothing is broadcast without your key.',
    );
  }

  // viem is loaded ONLY here so the keyless mock path needs no web3 dependency.
  let viem: typeof import('viem');
  let accounts: typeof import('viem/accounts');
  try {
    viem = await import('viem');
    accounts = await import('viem/accounts');
  } catch {
    throw new Error(
      "LIVE mode requires viem. Install it for the live leg:  pnpm add viem\n" +
        '(the keyless mock path deliberately does NOT depend on it).',
    );
  }

  const bepolia = {
    id: CHAIN_ID,
    name: 'Berachain Bepolia',
    nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;

  const account = accounts.privateKeyToAccount(
    (pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`,
  );
  const wallet = viem.createWalletClient({ account, chain: bepolia, transport: viem.http(rpcUrl) });
  const publicClient = viem.createPublicClient({ chain: bepolia, transport: viem.http(rpcUrl) });

  console.log(`Self-broadcasting from ${account.address} (on-chain \`from\` == this payer).`);
  console.log(
    'NOTE: all settlements broadcast from your single funded key, so on-chain\n' +
      '`from` stays the real signer. Farm-vs-clean SCORING on REAL addresses needs\n' +
      'getActivity (Dune-Sim-exclusive) — run CHAIN_PROVIDER=dune for that. This leg\n' +
      'proves real tx → settle() → explorer-resolvable (G-1 / Assertion C live).\n',
  );

  let settled = 0;
  let already = 0;
  for (const s of SCENARIO) {
    // Self-broadcast a real (tiny) native transfer to the synthetic recipient
    // label's checksum-safe placeholder — value is symbolic; the POINT is a real
    // tx whose `from` is the tester's key and whose hash resolves on-chain.
    const to = s.payer as `0x${string}`; // recipient is illustrative; `from` is what matters
    const txHash = await wallet.sendTransaction({ to, value: 1n });
    console.log(`  broadcast ${s.role.padEnd(13)} ${s.agent_id.padEnd(15)} tx_hash=${txHash}`);

    // READ the chain to CONFIRM before counting (SDD §5.4 / loa-arcturus-7bi).
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      throw new Error(`tx ${txHash} did not succeed on-chain (status=${receipt.status}); not counting.`);
    }
    const onchain = await publicClient.getTransaction({ hash: txHash });
    const realFrom = onchain.from; // the confirmed on-chain payer

    const outcome = await settleOne(pool, redis, s, realFrom, txHash);
    outcome === 'settled' ? settled++ : already++;
    console.log(
      `    confirmed from=${realFrom}  $${(Number(s.actual_micro) / 1e6).toFixed(6)}  (${outcome})`,
    );
  }

  console.log(`\nSelf-broadcast ${settled} real settlement(s)` + (already ? `, ${already} already present.` : '.'));
  console.log('Each tx_hash above resolves on https://bepolia.beratrail.io (Assertion C, LIVE).');
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = resolveMode();
  const pool = new Pool({ connectionString: dbUrl() });
  const redis = makeRedis();
  try {
    if (mode === 'mock') {
      await seedMock(pool, redis);
    } else {
      await seedLive(pool, redis, mode);
    }
  } finally {
    await pool.end();
    redis.disconnect();
  }
}

main().catch((e) => {
  console.error('\nseed:bepolia FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
