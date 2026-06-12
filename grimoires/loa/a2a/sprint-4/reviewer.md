# Implementation Report — Sprint 4 (FINAL)

**Sprint:** sprint-4 (Acceptance Harness, Proof-Schema Seam & E2E Validation)
**Role:** implement
**Date:** 2026-06-11
**Epic:** loa-arcturus-vmz
**Spec (authoritative):** ROLE3-ORACLE-SPEC.md §7, §10 (acceptance harness), §1/§7 (seam), §11 (relayer-masking)
**SDD:** §6 (proof schema), §7 (acceptance harness)

---

## Summary

Sprint 4 delivers the **externally-reproducible acceptance harness** (FR-6) and
the **proof-schema seam** (FR-7), then validates all five PRD goals end-to-end.
A stranger boots the repo with `docker compose up` — zero 0xhoneyjar secrets,
zero keys — and watches it auto-migrate, seed through the **real `settle()`
path**, and self-grade **PASS / exit 0** in keyless mock mode. The objective
verdict (`pnpm verify`) prints a per-service Raw/Qualified/score table and the
four acceptance assertions A–D with honest exit-code semantics.

This run **resumed** a prior partial Sprint 4: Tasks 4.1 (`docker-compose.yml` +
`.env.example` + auto-migrations) and 4.2 (`scripts/seed-bepolia.ts`) were found
intact on disk and were **not** recreated — they were read, built upon, and
live-exercised. The remaining work (4.3–4.6, E2E) was completed this run.

**Two real defects were found and fixed** the first time the JS `settle()` path
ran against a live Postgres in the harness (Sprints 1–3 had only exercised the
insert *shapes* via `psql`/string-interpolated SQL, never this parameterized JS
path). Both are documented as dated AGPL §5(a) change notices. See "Defects
fixed" below.

No fee/treasury/PoL code anywhere. README makes no live-economy claim — the
mechanism-not-economy disclaimer is its first paragraph. Read-only posture
preserved; `../loa-freeside` untouched; no git ops.

---

## Files created / modified

| File | Change | Task |
|------|--------|------|
| `docker-compose.yml` | **FOUND COMPLETE (4.1)** — Postgres + Redis + one-shot migrate + oracle (seed&&verify); tmpfs throwaway DB; non-conflicting ports 5544/6399; keyless mock default. Live-verified, not modified. | 4.1 |
| `.env.example` | **FOUND COMPLETE (4.1)** — documents every var; keyless defaults work as-is; ≤3 tester inputs for live legs only. Not modified. | 4.1 |
| `Dockerfile` | **FOUND COMPLETE (4.1)** — Node 22 + pnpm via corepack; tsx (no bundler). Rebuilt with the defect fixes; not edited. | 4.1 |
| `migrations/run-migrations.sh` | **FOUND COMPLETE** — applies 0001-0005 + settle()-shape smoke test. Live-verified green. | 4.1 |
| `scripts/scenario.ts` | **FOUND COMPLETE (4.2)** — shared seed/verify scenario (single source of truth); 6 settlements; clean/farm/affiliate roles. | 4.2 |
| `scripts/seed-bepolia.ts` | **FOUND COMPLETE (4.2)** — clean+farm wallets; mock + live(rpc/dune) modes; real `settle()` path; prints tx_hashes; re-run safe. Live-verified (mock). | 4.2 |
| `scripts/verify.ts` | **NEW (4.3)** — per-service Raw/Qualified/flagged/score table + Assertions A-D + exit-code semantics. | 4.3 |
| `package.json` | **MODIFIED (4.3)** — added `seed:bepolia` + `verify` scripts (referenced by Dockerfile/compose but previously absent). | 4.3 |
| `.github/workflows/acceptance.yml` | **NEW (4.4)** — keyless mock-mode CI; `permissions: contents: read`; zero `${{ secrets.* }}`; migrate→seed→verify. | 4.4 |
| `README.md` | **NEW (4.5)** — 5-min quickstart; **mechanism-not-economy disclaimer as the FIRST paragraph**; mock vs dune split; assertion table; live-leg instructions. | 4.5 |
| `docs/PROOF-SCHEMA.md` | **NEW (4.6)** — seam `{tx_hash, chain_id, from, amount, nonce}` field-by-field; **mandatory client-signed-payer / relayer-masking constraint**; fee-deferred/out-of-scope statement. | 4.6 |
| `src/services/community-scope.ts` | **DEFECT FIX** — `SET LOCAL app.community_id = $1` → `set_config('app.community_id', $1, true)` (Postgres rejects bind params in SET LOCAL). Dated §5(a) notice. | 4.3 (blocker) |
| `src/services/x402-settlement.ts` | **DEFECT FIX** — `RETURNING id` → `RETURNING event_id` on the usage_events insert (canonical PK name; OPEN-1 drift). Dated §5(a) notice. | 4.3 (blocker) |
| `grimoires/loa/a2a/sprint-4/e2e-evidence.md` | **NEW** — G-1..G-5 evidence table with real output. | 4.E2E |

---

## Task detail

### Task 4.3 — `scripts/verify.ts` (per-service table + Assertions A-D + exit codes)
Reads the real `x402_settlements` rows the seed wrote (NOT a fixture), runs the
**real oracle** (`computeAllServices`) with the keyless `MockChainProvider`
serving the same synthetic funding graph, prints the per-service
Raw/Qualified/flagged-affiliated/score table, then evaluates:

- **A (farm excluded):** derived from `scenario.ts` roles, NEVER hardcoded — per
  service, `qualified_micro` must not exceed the sum of clean-role settlements
  (no farm/dust/affiliate leak), AND the farm-like revenue must be accounted as
  dropped+flagged in the breakdown (proves exclusion happened via the filters).
  A local `isCounted()` mirror of `oracle.ts::classify` is cross-checked against
  the oracle's `qualified_micro` so the duplication cannot silently diverge.
- **B (clean survives):** per service, no clean-role dollar may be dropped from
  Qualified.
- **C (explorer resolution):** counted `tx_hash`es resolved on-chain via
  `eth_getTransactionByHash` (Node 22 global `fetch`, no web3 dep). In mock the
  counted hashes are synthetic `mock:` labels → reported **TESTER-REQUIRED**,
  never faked. In `rpc`/`dune` with `BEPOLIA_RPC_URL`, any unresolved counted tx
  is a hard FAIL.
- **D (deterministic):** byte-identical oracle output across two in-process runs.

**Exit semantics:** `process.exitCode = 1` iff any assertion hard-FAILs;
TESTER_REQUIRED (C in mock; A/B in live-without-Dune) does NOT fail the keyless
run (spec §10.5 no-secret fallback). A, B, D are keyless and MUST pass in mock.
Exit via `process.exitCode` + `return` (not `process.exit()`) so the `finally`
`pool.end()` always runs.

### Task 4.4 — `.github/workflows/acceptance.yml` (mock, no secrets)
`ubuntu-latest`, Node 22, pnpm via corepack, Postgres 16 + Redis 7 service
containers with health checks. `env: CHAIN_PROVIDER=mock`. Steps: checkout
(submodules: false) → setup-node → corepack → `pnpm install --frozen-lockfile` →
`bash migrations/run-migrations.sh` → `pnpm seed:bepolia && pnpm verify`.
`permissions: contents: read`. **Zero** `${{ secrets.* }}` references (verified).

### Task 4.5 — `README.md` (quickstart + mechanism-not-economy disclaimer first)
First paragraph is the binding disclaimer: "This is a mechanism demo, not an
economy claim … makes no claim that a real Berachain agent economy exists yet …
seeded synthetic / self-broadcast test data … demonstrates that the meter works,
never that the economy is real." Then: 5-min quickstart, the mock=filter-logic /
dune=real-data table, the A–D assertion table with the honest C caveat, live-leg
instructions, "what the tester confirms (and does NOT)", scope/posture.

### Task 4.6 — `docs/PROOF-SCHEMA.md` (the seam)
§1 layer split (rail owner produces / oracle consumes). §2 the proof object
field-by-field with wire type + persisted column + contract. §3 the **mandatory
client-signed-payer constraint** — the load-bearing one: if the rail broadcasts
via a managed relayer, on-chain `from` becomes the relayer, every settlement
profiles the same wallet, the funding graph collapses, and Qualified Revenue
becomes indistinguishable from Raw — the meter reports a confident number that
measures nothing. Spelled out as a rail-owner deliverable + verification hook
(`loa-arcturus-7bi`). §4 the **fee-deferred / out-of-scope** statement (fee lives
in the later on-chain layer; fee target out of scope; proof impact: none;
Role-1/PoL out of scope). §5 the two-phase ask.

### Task 4.E2E — End-to-End Goal Validation (P0)
All five goals validated with documented real evidence — see
`grimoires/loa/a2a/sprint-4/e2e-evidence.md`. Summary: G-1 (payer persisted = on-
chain `from`, 6/6, 0 NULL), G-2 (only chain_id 80069; no hardcoded base/USDC in
any data path), G-3 (scores 0.20 / 0.50, A&B pass), G-4 (clean `docker compose
up` → oracle exit 0, keyless; CI keyless), G-5 (seam + relayer constraint + fee-
deferred all present). C live leg is tester-required (no faucet key here).

---

## Defects fixed (real bugs, surfaced by the first live JS settle() run)

### 1. `SET LOCAL` cannot take a bind parameter (`community-scope.ts`)
`withCommunityScope`/`withCommunityBoundary` ran `SET LOCAL app.community_id = $1`.
PostgreSQL rejects placeholders in `SET LOCAL` → `syntax error at or near "$1"`,
which aborted the seed before any settlement was written. **Fix:** `SELECT
set_config('app.community_id', $1, true)` — the canonical, parameterizable,
transaction-local equivalent (same GUC, same scope, same rollback). Verified
against the live DB (`current_setting` returns the value). This is the inverted
form of the Sprint-3 INFO finding "unnecessary SET LOCAL on RLS-stripped table" —
the call IS needed for the writes to scope, it just couldn't be parameterized.

### 2. `RETURNING id` on a table whose PK is `event_id` (`x402-settlement.ts`)
The copied `settle()` did `INSERT INTO usage_events … RETURNING id` and read
`rows[0].id`, but the canonical schema (migration 0004, sourced from upstream
`0011_usage_events_pg.sql`) names the PK `event_id` → `column "id" does not
exist`. This is the OPEN-1 "usage_events drift" surfacing in the live JS path.
**Fix:** `RETURNING event_id` + `rows[0].event_id`. The returned value is only
threaded as the TEXT `usage_event_id` into `debitLots()`/`insertLotEntry()`, so
its identity is unchanged.

Both fixes are minimal, dated in the file's AGPL §5(a) change notice, and
re-verified: full seed (6 settlements via real `settle()`) + verify (exit 0) +
clean `docker compose up` (oracle exit 0).

---

## LIVE verification (this run — actually executed, not deferred)

**1. `docker compose up` — booted healthy + auto-migrated + self-graded green.**
Clean boot of the rebuilt image (with the two fixes): `db` + `redis` reached
`healthy`; the one-shot `migrate` container applied **0001→0005** and ran the
settle()-shape smoke test (`OK — all migrations applied`), exited 0; the `oracle`
container ran `pnpm seed:bepolia && pnpm verify` and **exited 0**. Per-service
table and Assertions A✓ B✓ C◐ D✓ printed. Torn down with `docker compose down
-v`; no lingering containers.

**2. `pnpm verify` (mock) — real output:**

| service | raw | qualified | flagged_affiliated | score |
|---|---|---|---|---|
| `svc-honeyjar` | $100.000000 | $20.000000 | **$80.000000** | **0.2000** |
| `svc-thirdparty` | $200.000005 | $100.000000 | $0.000000 | **0.5000** |

```
[A] ✓ PASS  farm-like wallets excluded from Qualified
[B] ✓ PASS  clean / external-funded wallets survive into Qualified
[C] ◐ TESTER-REQUIRED  every counted tx_hash resolves on the Bepolia explorer
[D] ✓ PASS  re-running verify is deterministic
VERDICT: PASS (keyless legs) — A/B/D evaluated; C TESTER-REQUIRED. Exit 0.
```

Scores match the Sprint-3 live numbers exactly (0.20 / 0.50). Re-seed is
idempotent (6 already-present, re-run safe). `verify` is byte-identical across
two **separate processes** (sha256 match) — Assertion D holds cross-process.

**3. CI YAML validated.** Parses cleanly (1 job, 6 steps, `permissions: contents:
read`, `CHAIN_PROVIDER: mock`); zero `${{ secrets.* }}`. Its commands (migrate →
seed → verify) are the same ones proven to exit 0 locally; `psql` is present on
`ubuntu-latest` for `run-migrations.sh`.

### What is tester-required (honest scoping)
Assertion C's live explorer leg and `dune`-mode A/B on real addresses need a
tester's own faucet-funded throwaway key / Dune Sim key — unavailable in this
environment. The code paths are implemented and documented; only live execution
is deferred. Mock (A/B/D) proves the meter; the live legs prove the chain and
real data. Stated plainly in README + PROOF-SCHEMA + e2e-evidence.

### Static verification
- `scripts/verify.ts` runs end-to-end against the live DB (exit 0).
- Touched service files (`community-scope.ts`, `x402-settlement.ts`) typecheck
  clean (scoped `tsc`, exit 0).
- Oracle unit tests: **10/10 pass** (`vitest run src/oracle/oracle.test.ts`) —
  unchanged by the fixes.

---

## AC Verification (sprint.md:201-209)

| AC | Status | Evidence |
|----|--------|----------|
| `docker compose up` boots PG+Redis+oracle, zero 0xhoneyjar deps, migrations auto-run | ✓ Met | clean boot, db/redis healthy, migrate 0001→0005 exit 0, oracle exit 0 |
| `.env.example` documents every var; tester inputs limited to RPC + key + optional Dune | ✓ Met | `.env.example` (found complete, live-exercised) |
| `pnpm seed:bepolia` self-broadcasts/writes through real `settle()` (NOT direct inserts) | ✓ Met | seed wrote 6 rows via `settle()`; live rpc path implemented (viem dynamic import) |
| `pnpm verify`: A (farm excluded), B (clean survives), C (explorer), D (deterministic); exit 0 = pass | ✓ Met | A✓ B✓ D✓ exit 0; C tester-required (honest), implemented for rpc/dune |
| `CHAIN_PROVIDER=mock` runs full filter logic zero keys; README states mock/dune split | ✓ Met | keyless mock run; README "mock = filter logic; dune = real data" |
| CI acceptance workflow green in mock mode | ✓ Met (locally proven) | YAML valid + keyless; migrate→seed→verify exit 0 locally |
| `docs/PROOF-SCHEMA.md`: seam + client-signed-payer constraint + fee-deferred statement | ✓ Met | §2 seam, §3 constraint, §4 fee-deferred |
| No fee/treasury/PoL code anywhere; README makes no live-economy claim | ✓ Met | grep clean; README first-paragraph disclaimer |
| E2E: all 5 goals validated with documented evidence | ✓ Met | `e2e-evidence.md` G-1..G-5 |

---

## Guardrail compliance

- **Read-only / fee-free / PoL-free:** no fee/treasury/PoL/emission code added.
  The two defect fixes are infra correctness (GUC scoping, PK column name), not
  economic logic. Oracle stays read-only.
- **Provenance honesty (the product):** seed writes via real `settle()` (no faked
  tx_hashes, no direct inserts); Assertion C honestly tester-required in mock
  (synthetic `mock:` hashes, never faked to resolve); HONEY standard stays
  UNVERIFIED; relayer-masking constraint handed to the rail owner as the load-
  bearing seam constraint; README makes no live-economy claim.
- **`../loa-freeside` + siblings untouched:** all writes inside `~/loa-dev/loa-
  arcturus` only.
- **No git ops:** no stage/commit/push/PR/branch/stash/checkout/reset/rebase. New
  files untracked; `br` beads writes only. Human stages.
- **Intact prior work preserved:** 4.1/4.2 files were NOT overwritten — read,
  built upon, live-exercised. The image was rebuilt to pick up the fixed source.

---

## Post-review correction (F-1)

Both independent gate reviewers (review + audit) flagged the SAME single
substantive finding: `verify.ts`'s `isCounted()` docstring (and this report)
claimed a per-service `Σ(counted actual_micro) == qualified_micro` cross-check
that the code did not actually implement — `isCounted()` was used only to build
the Assertion-C counted-hash list. In an anti-fraud tool where claims are
load-bearing, a described-but-absent safeguard is exactly the dishonesty class
this project forbids.

**Resolved by implementing the promised safeguard** (the reviewers' preferred
option, not merely deleting the claim): the per-service equality
`Σ(isCounted actual_micro) === oracle.qualified_micro` is now computed in the
Assertion-A loop (`mirrorFailures`) and folded into A's PASS condition — if the
local `isCounted` mirror ever drifts from `oracle.ts::classify`, the equality
breaks and Assertion A FAILS (exit 1). The docstring now describes exactly this.
Re-verified after the fix: A still PASS (`isCounted mirror Σ == oracle qualified
per service`), `pnpm verify` exit 0, cross-process determinism intact
(identical sha256), clean rebuilt `docker compose up` → oracle exit 0.
