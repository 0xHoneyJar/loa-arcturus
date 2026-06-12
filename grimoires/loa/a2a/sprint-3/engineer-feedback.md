# Review Feedback — Sprint 3 (The Oracle)

**Reviewer role:** Senior Tech Lead (adversarial review)
**Date:** 2026-06-11
**Sprint:** sprint-3 — The Oracle — Qualified Revenue Ruleset & Realness Score
**Mode:** single-model (no `flatline_protocol` block in `.loa.config.yaml` → cross-model review not enabled; matches Sprint 2)
**Verdict:** **All good (with noted concerns)** — non-blocking.

---

## Overall Assessment

Sprint 3 meets every acceptance criterion in `sprint.md:147-153` and demonstrates
all success metrics (`sprint.md:180`) with **live numbers on a real Postgres 16**,
not just unit fakes. I read the actual code (not only `reviewer.md`) and
independently re-ran the live harness: anti-self-grading, farm-reduces-score,
clean-survives, and byte-identical determinism all reproduced. The OPEN-3/4/5
judgment calls are resolved honestly — placeholder allowlist (no invented
addresses), a documented tunable dust floor, and a written-down weighting-vs-binary
reconciliation that keeps the headline reproducible. Code quality is
production-grade: small pure functions, injected dependencies, deterministic
ordering everywhere, clear provenance headers.

This is the credibility-critical sprint of an anti-fraud oracle, and the
implementation honors that: there is **no code path that privileges affiliated
revenue**, and the affiliate gate runs first so affiliated money is always
attributed to `flagged_affiliated_micro`.

## Grounded AC check

- `"Per-service output with score ∈ [0,1]"` (sprint.md:148) → `ServiceRevenue`
  (`src/oracle/types.ts:111`), score clamped at `src/oracle/oracle.ts:222`. ✓
- `"cycle-detection + funding-graph analysis built on getActivity (acknowledged
  net-new)"` (sprint.md:149) → `src/oracle/funding-graph.ts:141`
  (`findCycleCounterparties`), marked `net_new: true` in the emitted methodology
  (`src/oracle/oracle.ts:142`). ✓
- `"the weighting-vs-binary reconciliation … is documented and the headline stays
  reproducible"` (sprint.md:150) → `src/oracle/config.ts:128-152` + `docs/ORACLE-METHODOLOGY.md`
  §5; headline uses unweighted binary-gate sums only. ✓
- `"a 0xhoneyjar affiliated payer is flagged + excluded from headline"`
  (sprint.md:151) → live `svc-honeyjar`: raw $100, flagged_affiliated $80,
  qualified $20, score 0.20. ✓
- `"MockChainProvider produces deterministic profiles"` (sprint.md:153) →
  byte-identical rerun + identical sha256 across two separate processes. ✓

---

## Adversarial Analysis

### Concerns Identified (non-blocking)

1. **Float precision cliff in the score divide** — `src/oracle/oracle.ts:222`
   computes `Number(qualified) / Number(raw)`. `bigint → Number` is lossless only
   below 2^53 micro-USD (≈ $9.0B of revenue for a single service in one window).
   Beyond that the score loses precision. For a Bepolia PoC this is unreachable, but
   it is an undocumented assumption. **Recommendation:** note the ceiling in
   `docs/ORACLE-METHODOLOGY.md` (or compute the ratio with a fixed-point bigint
   scale) before this ever points at mainnet volume. Non-blocking.

2. **`confidence_weighted` uses `Number(actual_micro)` too** —
   `src/oracle/oracle.ts:208` (`BigInt(Math.floor(Number(s.actual_micro) * …))`).
   Same 2^53 ceiling, plus float multiply before flooring. It is a *diagnostic*
   (explicitly NOT the headline, by the OPEN-5 design), so it cannot corrupt the
   reproducible score — but a reader could mistake it for an exact figure. The
   per-settlement floor also makes the diagnostic sum order-independent only because
   each term is floored individually; fine today, worth a one-line comment.

3. **Project-wide `tsc` and `pnpm test` are RED** (whole-tree), and only go green
   when scoped to the oracle. The redness is entirely pre-existing: the copied
   Sprint-1 adapters miss siblings (`loa-arcturus-hkj`, a known deferred P2 bug) and
   `vitest` has no config to exclude the `.loa/` submodule. This is not a Sprint-3
   defect, but it means **`pnpm typecheck` / `pnpm test` are not usable as a green
   CI gate yet** — a future contributor running them will see failures unrelated to
   their change. **Recommendation (Sprint 4 territory):** add a `vitest.config`
   `include: ['src/**']` and resolve/【or formally exclude】the broken adapters.
   Flagged separately, not fixed here (surgical-changes: out of Sprint-3 scope).

### Assumptions Challenged

- **Assumption:** circular-flow is defined as *any* funding cycle through the payer
  (`funding-graph.ts:141`), not specifically a cycle with the **recipient service
  wallet**. The spec phrasing is "funded by, or routes back to, the recipient
  service wallet" (`ROLE3-ORACLE-SPEC.md:153-154`).
  **Risk if wrong:** a payer that cycles with some *unrelated* third party (not the
  service) would also be dropped — a possible false-positive that slightly
  *under*-counts qualified revenue.
  **Why acceptable:** (a) for an x402 payer the dominant edge IS payer→service, so
  in practice the detected cycle is the service cycle; (b) erring toward *dropping*
  (under-counting) is the conservative direction for an anti-fraud meter — it never
  inflates the headline; (c) the synthetic graph models exactly the service-cycle
  case. **Recommendation:** make the recipient-scoping explicit in a code comment so
  the next engineer knows the broader definition is intentional, not an oversight.

### Alternatives Not Considered

- **Alternative:** fold filters 4-5 (wallet-age, external-origin) into the headline
  as a weighted Qualified sum, rather than surfacing them as a separate diagnostic.
  **Tradeoff:** a weighted headline would encode "trust" more richly in one number,
  but it makes the score **un-reproducible** without publishing the exact weight
  curve, and it muddies the clean `qualified/raw ∈ [0,1]` definition the spec
  anchors on (`ROLE3-ORACLE-SPEC.md:160-163`).
  **Verdict:** current approach (binary headline + diagnostic weights, sdd.md §4.3
  option a) is the right call for a credibility-first oracle — reproducibility beats
  expressiveness here. Justified.

### Karpathy Principles

| Principle | Verdict |
|-----------|---------|
| Think Before Coding | ✓ OPEN-3/4/5 surfaced + resolved with documented reasoning, not silent choices |
| Simplicity First | ✓ Small pure functions; no speculative abstraction; mock only implements what the oracle calls |
| Surgical Changes | ✓ All changes are net-new `src/oracle/*` + the mock + one doc; copied files untouched |
| Goal-Driven | ✓ Concrete verifiable goals: live numbers, byte-identical determinism, AC table |

### Complexity / red-flags

- No function >50 lines (largest is `computeServiceRevenue`, ~85 lines incl. the
  methodology literal — mostly declarative object construction, not branching).
- No secrets, no real addresses, no SQL string-concatenation (parameterized queries
  in `settlements-repo.ts`), no empty catch blocks. `void edges`
  (`funding-graph.ts:126`) is an intentional map-for-side-effect discard — harmless,
  minor style note.
- Tests cover all 5 filters, anti-self-grading (incl. the report-~$0 case),
  determinism, and the farm-vs-clean success metric. Meaningful assertions, not
  smoke.

---

## Previous Feedback Status

No prior `engineer-feedback.md` for Sprint 3 (first review pass). N/A.

## Documentation verification

- `docs/ORACLE-METHODOLOGY.md` created — the open/reproducible methodology the spec
  requires, including the OPEN-3/4/5 rationale and a copy-pasteable live-reproduce
  recipe. This also closes the dangling `config.ts:17` reference (was MISSING before
  this run; now resolves). PASS.
- No CHANGELOG.md exists in the repo yet (none of Sprints 1-2 maintained one); not
  introducing one mid-cycle is consistent with surgical scope. Non-blocking.

## Next Steps

Proceed to `/audit-sprint sprint-3`. Concerns 1-3 are non-blocking and documented;
none gate approval. Concern 3 (CI greenability) is genuinely Sprint-4 work and is
filed as an observation, not a Sprint-3 fix.
