# Sprint 4 — Task 4.E2E: End-to-End Goal Validation (G-1..G-5)

**Date:** 2026-06-11 (Sprint 4 — FINAL sprint).
**Mode:** keyless `CHAIN_PROVIDER=mock` (the no-secret acceptance path).
**Environment:** Docker 29.5.3, Compose v5.1.4, Node 22.22.0, pnpm 9.15.4, Postgres 16, Redis 7.
**Posture:** read-only / fee-free / PoL-free; `../loa-freeside` untouched; no git ops.

> **Honesty rule applied:** no goal is marked achieved without documented real
> evidence; no leg is claimed live that was not run live here. Assertion C's live
> explorer leg is **tester-required** (no faucet key in this environment) and is
> stated as such — never faked.

---

## Evidence table

| Goal | Goal | Validation action (run here) | Result | Status |
|------|------|------------------------------|--------|--------|
| **G-1** | Persist payer identity | `pnpm seed:bepolia` (real `settle()` path) → `SELECT … FROM x402_settlements` | All **6** settlements have `payer_address` populated = the on-chain `from`; **0** NULL/empty. Addresses match `scripts/scenario.ts` exactly (e.g. `0xc1ea0a6ed…c0005` for clean-CEX, `0xaff111a7e…0009` for affiliate). | ✅ **ACHIEVED** |
| **G-2** | Config-driven chain, Bepolia 80069 | `SELECT DISTINCT chain_id` + grep for hardcoded base/USDC/8453 | Only `chain_id = 80069` present. No `8453`/`base`/`USDC` in any data path — the only hits are JSDoc/comments documenting that Sprint 2 *replaced* them. Facilitator reads `CHAIN_CONFIGS`. | ✅ **ACHIEVED** |
| **G-3** | Qualified Revenue + score | `pnpm verify` (real oracle over real rows) | Assertions **A & B PASS**. `svc-honeyjar` score **0.2000** (raw $100 / flagged $80 / qualified $20 → anti-self-grading); `svc-thirdparty` score **0.5000** (raw $200.000005 / qualified $100 → farm $100 + dust $0.000005 dropped, 2 clean survive). Both scores ∈ [0,1]. | ✅ **ACHIEVED** |
| **G-4** | External reproducibility | `docker compose up` clean boot (rebuilt image), no secrets | One command booted Postgres+Redis healthy, **auto-migrated 0001→0005**, seeded via real `settle()`, verified, **oracle exit code 0**. CI workflow (`.github/workflows/acceptance.yml`) is keyless (`permissions: contents: read`, zero `${{ secrets.* }}`), runs the same migrate→seed→verify; commands proven to exit 0 locally. | ✅ **ACHIEVED** |
| **G-5** | Proof-schema seam | Read `docs/PROOF-SCHEMA.md` | Seam `{tx_hash, chain_id, from, amount, nonce}` documented field-by-field (§2); the **mandatory client-signed-payer / relayer-masking constraint** is §3 ("load-bearing", with the relayer-collapse failure mode spelled out); the **fee-deferred / out-of-scope** statement is §4. | ✅ **ACHIEVED** |

---

## Data-flow end-to-end (G-1..G-4 chained)

```
self-broadcast/synthetic tx ─▶ settle() ─▶ x402_settlements ─▶ oracle (computeAllServices) ─▶ verify (A-D)
   (mock: synthetic `from`)     (REAL path)  (payer_address      (§5 filters, MockChainProvider   (exit 0)
                                              persisted, G-1)      funding graph)
```

Confirmed live: seed wrote 6 rows through `settle()` (NOT direct inserts); the
oracle read those exact rows and produced the documented scores; `verify` graded
them and exited 0. Re-seed is idempotent (6 already-present, re-run safe);
`verify` is byte-identical across two **separate processes** (Assertion D holds
cross-process, sha256-confirmed).

## The four acceptance assertions (`pnpm verify`, mock mode — REAL output)

| ID | Status | Evidence |
|----|--------|----------|
| **A** farm excluded | ✅ **PASS** | No farm/dust/affiliate revenue leaked into any service's Qualified; $180.000005 farm-like revenue accounted as dropped+flagged via filters 1-3. |
| **B** clean survives | ✅ **PASS** | Every clean-role settlement's revenue counted in its service's Qualified ($100 thirdparty + $20 honeyjar). |
| **C** tx resolves on explorer | ◐ **TESTER-REQUIRED** | Mock counted hashes are synthetic `mock:` labels (`mock:0xhj_clean`, `mock:0xtp_clean_bridge`, `mock:0xtp_clean_cex`) — they do NOT resolve on `https://bepolia.beratrail.io`, and the harness does NOT fake resolution. Run `CHAIN_PROVIDER=rpc` + `BEPOLIA_RPC_URL` + a faucet-funded `SEED_PRIVATE_KEY` to evaluate live. The `rpc` path is implemented (`scripts/seed-bepolia.ts` self-broadcasts + confirms on-chain; `verify.ts` resolves each counted tx via `eth_getTransactionByHash`). |
| **D** deterministic | ✅ **PASS** | Byte-identical oracle output across two in-process runs AND two separate processes (sha256 match). |

**Exit code: `0`** (A, B, D pass; C tester-required does not fail the keyless run,
per the spec §10.5 no-secret-fallback design).

---

## What remains tester-required (honest scoping)

- **Assertion C live leg** (and the `dune`-mode A/B on *real* addresses) require a
  tester's own faucet-funded throwaway key / Dune Sim key — neither is available
  in this environment. The code paths are implemented and the commands are
  documented in `README.md`; only the live execution is deferred to a tester. The
  keyless mock run (A/B/D) proves the **meter**; the live legs prove the **chain**
  and **real data**. This split is stated plainly in `README.md` and
  `docs/PROOF-SCHEMA.md`.
