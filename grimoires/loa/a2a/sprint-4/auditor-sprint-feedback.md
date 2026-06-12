# Audit Feedback — Sprint 4 (FINAL)

**Sprint:** sprint-4 (Acceptance Harness, Proof-Schema Seam & E2E Validation)
**Role:** audit (independent security/quality auditor — final gate)
**Date:** 2026-06-11
**Verdict:** **APPROVED** (was APPROVED-WITH-FINDINGS; the one substantive finding F-1 resolved)

---

## Overall

The deliverable is credibility-grade. The harness is genuinely keyless; provenance
honesty is real and pervasive (visibly the product, not a checkbox); SQL is
uniformly parameterized; the relayer-masking constraint is present and correctly
stated as load-bearing; scope discipline holds (no fee/treasury/PoL code); and
external-RPC input is handled safely. **No finding rose to CRITICAL or HIGH** —
nothing lets the meter fake a green result, leak a secret, or make a dishonest
claim to the rail owner.

## Findings

| # | Sev | File:line | Description | Status |
|---|-----|-----------|-------------|--------|
| F-1 | **LOW** | `verify.ts:146-154` (+ report) | Docstring claimed an `isCounted()` `Σ(counted)==qualified_micro` anti-drift cross-check that was not implemented (it fed only the Assertion-C hash list). Anti-fraud tool ⇒ overstated safeguard is itself a (small) honesty defect. Core fraud-resistance (Assertion A real-oracle-vs-scenario) was never weakened. | **RESOLVED** — equality implemented in the Assertion-A loop; mirror drift now fails the run (exit 1). Re-verified PASS / exit 0. |
| F-2 | INFO | `.github/workflows/post-merge.yml` | Framework post-merge CI references `${{ secrets.* }}`. Out of scope (acceptance CI is keyless). Optionally note/exclude from the tester-facing tree when shipping. | Accepted |
| F-3 | INFO | `package.json` / `seed-bepolia.ts` | `viem` deliberately absent (keyless mock web3-free); live legs need `pnpm add viem`, honestly disclosed. README could state the install explicitly. | Accepted (doc nicety) |
| F-4 | INFO | `migrations/run-migrations.sh:42` | Smoke test uses literal `SET LOCAL …='<const UUID>'` (no bind param) — safe (hardcoded, not external input); distinct from the JS path that needed the `set_config` fix. | Accepted |

## Pass/fail on each focus area (with evidence)

1. **SECRETS — PASS.** `acceptance.yml` keyless (`permissions: contents: read`,
   `CHAIN_PROVIDER: mock`, zero `${{ secrets.* }}`); throwaway DB creds only.
   `SEED_PRIVATE_KEY` read from env, never logged (only derived public
   `account.address` printed); DB URL masked in verify output. `.env`/`.env.local`
   gitignored. No 0xhoneyjar-only dependency (public images only).
2. **PROVENANCE HONESTY — PASS.** Seed writes via real `settle()` (not direct
   inserts, no faked hashes — `mock:` labels are unmistakably synthetic);
   Assertion C honestly tester-required for synthetic hashes and hard-FAILs an
   unresolved counted tx live ("a counted tx not on-chain is fabricated
   revenue"); README disclaimer first, no live-economy claim; HONEY left
   UNVERIFIED; affiliate addresses are clearly-labeled unmatchable placeholders.
3. **SQL/INJECTION — PASS.** All queries parameterized; `set_config(...,true)` is
   safe and transaction-local; no SQL interpolation of external input;
   `RETURNING event_id` is a column-name correction (no injection surface).
4. **RELAYER-MASKING CONSTRAINT — PASS.** `PROOF-SCHEMA.md` §3 states it as
   MANDATORY/load-bearing with the relayer-collapse failure mode, a concrete
   rail-owner deliverable, and a verification hook (`loa-arcturus-7bi`).
5. **SCOPE DISCIPLINE — PASS.** No fee/treasury/PoL/emission code (the `fee` field
   in the chain-provider type is on-chain gas-fee metadata, pre-existing Sprint-3,
   not a protocol fee); no out-of-repo writes; no git stage/commit/push; defect
   fixes are infra correctness only (GUC parameterization + PK column name),
   economic logic untouched (oracle tests 10/10).
6. **INPUT HANDLING — PASS.** RPC URL from trusted env; static JSON-RPC body;
   response `result` treated only as a nullness signal; no eval / no instruction
   interpretation; counted hashes validated `0x[0-9a-fA-F]{64}` before live
   evaluation; RPC errors degrade to TESTER_REQUIRED (never silently to PASS).

## Decision

**APPROVED.** Final gate cleared. F-1 resolved by implementing the promised
safeguard; remaining findings are INFO/accepted. The harness delivers what it
claims to the external party (external on-chain rail owner) on every credibility-critical
axis. This is the FINAL sprint — the PoC acceptance harness is complete; the only
items that remain are tester-required by design (Assertion C live explorer leg +
`dune`-mode A/B on real addresses), which require a tester's own faucet key / Dune
key and are honestly documented as such.
