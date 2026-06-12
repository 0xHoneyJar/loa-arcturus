# Review Feedback — Sprint 4 (FINAL)

**Sprint:** sprint-4 (Acceptance Harness, Proof-Schema Seam & E2E Validation)
**Role:** review (independent reviewer, separate from implementer)
**Date:** 2026-06-11
**Verdict:** **APPROVE-WITH-CONCERNS → concern resolved → APPROVE**

---

## Overall

The acceptance harness is correct, honest, and externally reproducible.
Assertions A/B/D test the **real oracle** against **scenario ground truth** (not
hardcoded numbers, not vacuously); Assertion C is honestly tester-required in
mock and never fakes resolution; exit-code / `pool.end()` semantics are correct;
both defect fixes are correct and properly dated; guardrails (no fee/treasury/PoL
code, no git ops, no out-of-repo writes, keyless CI) hold.

The review surfaced **one substantive finding (F-1, MEDIUM)** — an overclaimed
cross-check in `verify.ts`'s docstring + the implementer report. It has been
**resolved** (see below), clearing the path to APPROVE.

## Findings

| Sev | File:line | Finding | Status |
|-----|-----------|---------|--------|
| **MEDIUM** | `verify.ts:146-154` + `reviewer.md` | **Overclaimed cross-check.** Docstring/report claimed `isCounted()` was cross-checked as `Σ(counted) == qualified_micro` per service "and the run fails on drift" — but no such equality was implemented; `isCounted()` fed only the Assertion-C hash list. In an anti-fraud PoC, a described-but-absent safeguard is the exact dishonesty class the project forbids. (The A/B check that WAS implemented — real-oracle `qualified_micro` vs scenario clean-sum — is sound and strictly stronger than comparing the oracle to a copy of its own logic, so fraud-resistance was never actually weakened; only the description was false.) | **RESOLVED** — the `Σ(isCounted) == qualified_micro` per-service equality is now implemented in the Assertion-A loop and fails the run (exit 1) on mirror drift, matching the docstring. Re-verified: A PASS, exit 0, determinism intact. |
| LOW | `.github/workflows/post-merge.yml` | Repo's Loa-framework post-merge workflow references `${{ secrets.* }}`. **Out of scope** — the *acceptance* workflow (`acceptance.yml`) is keyless; the AC scopes "no secrets" to the acceptance CI. Not a Sprint-4 violation. | Accepted (not a deliverable) |
| INFO | `verify.ts:380-390` | Assertion A's `farmAccountedFor` uses a global sum while the leak guard is per-service. The per-service guard is the real anti-leak check and is sound; the global term is belt-and-suspenders for the fixed scenario. | Accepted |
| INFO | `package.json` / lockfile | `viem` intentionally absent (keyless mock never imports it; `--frozen-lockfile` passes). Live `rpc`/`dune` legs require `pnpm add viem`, honestly disclosed in `seed-bepolia.ts`. | Accepted |

No BLOCKER or HIGH findings.

## Checklist verification (confirmed with evidence)

1. **verify.ts assertions / exit codes / mirror — CONFIRMED.** A/B derived from
   `scenario.ts` (not hardcoded); exit via `process.exitCode + return` so
   `finally { pool.end() }` always runs; `isCounted()` gate order matches
   `oracle.ts::classify` (affiliate→dust→circular); A cannot pass vacuously
   (`totalFarmMicro > 0n` required). Mirror cross-check now implemented (F-1).
2. **Assertion C honesty — CONFIRMED.** Mock → `TESTER_REQUIRED`, explicitly
   states synthetic `mock:` hashes do not resolve; no path fabricates resolution;
   live mode hard-FAILs any unresolved counted tx.
3. **Defect fixes — CONFIRMED.** `set_config(...,true)` is the transaction-local,
   parameterizable equivalent of `SET LOCAL`; `RETURNING event_id` matches the
   actual PK (`migrations/0004:38`); both dated in AGPL §5(a) notices.
4. **README disclaimer — CONFIRMED.** Mechanism-not-economy is literally the
   first paragraph; no live-economy claim anywhere.
5. **PROOF-SCHEMA.md — CONFIRMED.** All 5 fields; client-signed-payer /
   relayer-masking constraint present as load-bearing §3; fee-deferred §4.
6. **CI yaml — CONFIRMED.** Zero `${{ secrets.* }}`; `permissions: contents:
   read`; `CHAIN_PROVIDER: mock`.
7. **Guardrails — CONFIRMED.** No fee/treasury/PoL code; no git ops; no
   `child_process`/file-writes/`../` traversal in scripts; no `loa-freeside` refs.

## Recommendation

**APPROVE.** The single substantive finding (F-1) was resolved by implementing
the promised safeguard. All acceptance criteria met; harness delivers what it
claims on every credibility-critical axis.
