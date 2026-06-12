# Security & Quality Audit — Sprint 3

**Sprint:** sprint-3 (The Oracle — Qualified Revenue Ruleset & Realness Score)
**Role:** audit (final quality gate)
**Date:** 2026-06-11

---

## Verdict

**APPROVED**

No CRITICAL or HIGH findings. Two INFO notes below — neither blocks Sprint 3. The
oracle is read-only / fee-free / PoL-free, provenance-honest on all three open
questions (OPEN-3/4/5), scope-disciplined (no Sprint-4 work leaked), and was
**live-verified against a real Postgres 16** with the anti-self-grading, farm-
reduces-score, clean-survives, and determinism behaviors demonstrated by actual
numbers.

> **Audit mode note:** single-model audit. `flatline_protocol` is not enabled in
> `.loa.config.yaml`, so the cross-model dissenter phase did not run and the
> `adversarial-review-gate` hook does not fire on the COMPLETED marker (it gates
> only when flatline is enabled). No `DEGRADED_SECURITY_REVIEW` marker is set
> because the dissenter is disabled by configuration, not by a failure. Recorded
> for honesty. (Same posture as Sprint 1/2.)

---

## Audit dimensions

| # | Dimension | Result |
|---|-----------|--------|
| 1 | Hardcoded secrets (keys/tokens/passwords) in Sprint-3 files | ✅ none. The only "treasury"/"key" hits are the **labeled PLACEHOLDER** allowlist entries (`0x0000…0000`, `0x0000…dead`) — the honest OPEN-3 resolution, not a secret. The `POSTGRES_PASSWORD=arcpoc` lives only in the throwaway test container (torn down, never committed). |
| 2 | Fee / treasury / PoL / emission / reward-vault / splitter code | ✅ none. The oracle never gates emissions and never writes chain state. The only `fee`/`feeUsd` fields (`mock-chain-provider.ts`) are the **gas-fee fields of the `getActivity()` return type** mandated by the `IChainProvider` port — inert (`fee: 0n`), not protocol-fee logic. |
| 3 | Chain WRITE / signer / sendTransaction / broadcast | ✅ none. No `sendTransaction`/`signTransaction`/`writeContract`/`privateKey`/wallet broadcast anywhere in the oracle path. Read-only posture verified (`ROLE3-ORACLE-SPEC.md:11-16, 170`). |
| 4 | SQL injection / dynamic SQL | ✅ safe. `settlements-repo.ts` binds `agent_id` as `$1` and window bounds as `$2+`; `windowClause` interpolates ONLY `$N` placeholders from an integer counter (never user data). The lone `SET LOCAL app.community_id='…'` interpolation (`verify-live.ts:67`) uses a **hardcoded constant UUID** (`verify-live.ts:37`), not user input. |
| 5 | Determinism / no wall-clock in scoring path | ✅ `Date.now()`/`Math.random()` appear nowhere in the oracle. Wallet-age math is relative to a caller-supplied `asOf`; mock derives all timestamps from a fixed `epoch`. Verified live: byte-identical output + identical sha256 across two separate processes. |
| 6 | Debug / TODO / FIXME / console.log leftovers in library files | ✅ none in library modules. `console.log` appears only in `verify-live.ts` (an explicit CLI verification driver — expected and appropriate). |
| 7 | Scope discipline (no Sprint-4 work leaked) | ✅ no `docker-compose.yml`, no `scripts/seed-bepolia.ts` / `verify.ts`, no `.github/workflows/`, no README quickstart, no `docs/PROOF-SCHEMA.md`. `verify-live.ts` is a Sprint-3-scoped live driver, explicitly NOT the Sprint-4 acceptance harness (stated in its header). |
| 8 | Git cleanliness (no staging/commit/push; siblings untouched) | ✅ no git mutations performed. `../loa-freeside` = **0 dirty lines**. All new Sprint-3 files are untracked; human stages. |
| 9 | Test integrity (meaningful, not smoke) | ✅ 10/10 oracle tests cover all 5 filters, anti-self-grading (incl. report-~$0), determinism, and the farm-vs-clean success metric, with exact-value assertions. |
| 10 | Live DB gate | ✅ migrations 0001→0005 green on Postgres 16; `UNIQUE(chain_id,tx_hash)` live-rejected a duplicate; `prevent_mutation()` live-blocked an UPDATE; container torn down (no lingering `arc-pg` containers). |

---

## Findings

### INFO-1 — `Number()` precision ceiling on the score divide (carried from review concern #1)
`oracle.ts:222` computes `Number(qualified) / Number(raw)` and `oracle.ts:208`
uses `Number(s.actual_micro)` for the diagnostic weighted sum. `bigint → Number`
is lossless only below 2^53 micro-USD (≈ $9.0B per service per window) —
unreachable for a Bepolia PoC, but an undocumented assumption. The headline score
remains an exact ratio of exact bigint sums up to that ceiling. **Recommendation:**
document the ceiling (or move to fixed-point bigint division) before pointing at
mainnet volume. Non-blocking. No action for Sprint 3.

### INFO-2 — `SET LOCAL app.community_id` is unnecessary on `x402_settlements`
`verify-live.ts:67` sets the tenant GUC before inserting, but migration 0005
stripped RLS — `pg_class.relrowsecurity = f` was confirmed live, so no policy
consults the GUC. The statement is harmless (constant UUID) and mirrors the
`settle()` transaction shape for fidelity, but it is dead ceremony for the
read-only oracle. Non-blocking; informational for whoever writes the Sprint-4
seed/verify scripts.

---

## Anti-fraud-specific checks (this project's threat model — the product IS honesty)

- **OPEN-3 (affiliate allowlist) — HONEST.** No real 0xhoneyjar address was
  invented. The allowlist is config-driven (`AFFILIATE_ALLOWLIST` /
  `AFFILIATE_ALLOWLIST_FILE`) and ships only clearly-labeled, intentionally-
  unmatchable PLACEHOLDERS with a documented provenance rule ("any address here
  MUST come from a cited source"). The flag-not-count mechanism works regardless of
  which addresses populate the list — proven live by injecting the *synthetic*
  affiliate payer. ✅
- **OPEN-4 (dust floor) — HONEST.** Default $0.01 (10_000 micro-USD) is a documented
  chosen assumption with reasoning (matches loa-freeside `MICRO_PER_CENT`; smallest
  unit settle math reasons in; removes cheapest wash-farm vector), config-driven via
  `DUST_FLOOR_MICRO`, not a magic literal. ✅
- **OPEN-5 (weighting vs binary) — HONEST + reproducible.** The headline
  `score = qualified/raw` is a ratio of UNWEIGHTED binary-gate sums; filters 4-5 are
  DIAGNOSTIC weights surfaced separately as `confidence_weighted_qualified_micro`
  and never enter the headline. An external party reproduces the headline from the
  binary rules alone. Written down in `config.ts` + `docs/ORACLE-METHODOLOGY.md` §5.
  ✅
- **ANTI-SELF-GRADING — PROVEN (the philosophical core, spec :164-167).** Every
  `agent_id` is indexed uniformly; the affiliate gate runs FIRST so affiliated
  revenue is always attributed to `flagged_affiliated_micro` and excluded from the
  headline. There is **no code path that privileges affiliated revenue.** Live: a
  0xhoneyjar service paid 80% by an affiliated wallet reports raw $100,
  flagged_affiliated $80, qualified $20, **score 0.20** — the oracle does not
  flatter the team. ✅
- **NET-NEW honesty.** Filter 3's funding-graph + cycle detection is marked
  `net_new: true` in the emitted methodology and in code headers — built on
  `getActivity`, NOT claimed as inherited from loa-freeside (spec :301-305). ✅
- **Methodology open & reproducible.** Emitted in the `methodology` field every run
  and documented in `docs/ORACLE-METHODOLOGY.md` with a copy-pasteable live-reproduce
  recipe (closes the previously-dangling `config.ts:17` reference). ✅
- **No premature Role-3→Role-1 weld.** Read-only / fee-free / PoL-free preserved;
  the oracle measures, it does not gate. ✅

---

## Acceptance

Sprint 3 passes the security/quality gate. Creating the COMPLETED marker.
