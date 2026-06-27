# Eileen Daily Implementation Agent Mode Agent

This repo-local runbook must be read by the daily GPT-5.5 Thinking implementation agent before editing `0xHoneyJar/loa-arcturus`. The agent must decide what should be implemented and why before coding, then write a PR report that traces every commit/file change back to repo value, scaling, security, and simplicity.

## Repository responsibility

`loa-arcturus` owns proof-of-revenue and revenue-oracle work: x402 settlement shape, anti-sybil revenue filtering, reproducible open meters, Berachain agent-commerce infrastructure, raw vs qualified revenue, and mock/RPC/Dune measurement modes.

Arcturus must not become the product billing repo, Freeside entitlement system, Finn experiment verdict repo, Dixie BFF, Hounfour schema package, Straylight continuity layer, or Aleph research-précis substrate.

## Eligible input

Implement only from a Daily Deep Research Report or plan-audit item with `PROPOSED_NEXT_LANE_SEED`, candidate ID, repo-fit reasoning, acceptance criteria, rollback path, and `VERDICT: ACCEPT_PLAN`.

Without `VERDICT: ACCEPT_PLAN`, the agent may self-audit only docs, fixtures, tests, or checkers. Live settlement or oracle behavior requires explicit external acceptance.

## Required pre-implementation thesis

Before editing, write and preserve this analysis:

1. candidate issue, candidate ID, and verdict
2. what should be implemented
3. why it should be implemented now
4. why it belongs in Arcturus and not a sibling repo
5. what this is good for
6. why the implementation path should work
7. how it advances Arcturus's endgame as a reproducible proof-of-revenue oracle
8. creative future paths not implemented now
9. mass-user scaling impact for settlement volume, meter cost, RPC/Dune usage, data retention, and reproducibility load
10. security scope for settlement parsing, sybil filtering, data provenance, mock/live separation, and oracle-claim integrity
11. simplicity argument: how the design avoids fragile revenue logic or unsupported economy claims
12. non-goals, forbidden surfaces, checks, and rollback

If this thesis is weak, do not implement.

## Additive-only policy

Allowed by default: new docs, fixtures, tests, deterministic checkers, settlement-shape drift sentinels, and default-off measurement helpers.

Forbidden without explicit Eileen approval: deleting files, claiming mock data proves real revenue, changing raw/qualified revenue semantics by default, changing live RPC/Dune behavior by default, broad refactors, unrelated dependency upgrades, sibling repo mutation, auto-merge, or closing source issues.

## Arcturus-specific stop conditions

Stop with `VERDICT: NEEDS_HUMAN` if the candidate alters live payment/oracle behavior, weakens anti-sybil filtering, collapses raw and qualified revenue, or makes unsupported economy claims.

## Implementation steps

1. Read this file, README/package scripts, and nearby docs.
2. Confirm `VERDICT: ACCEPT_PLAN`.
3. Check for duplicate open issues/PRs.
4. Write the required pre-implementation thesis.
5. Create branch `daily-impl/YYYY-MM-DD-loa-arcturus-<candidate>`.
6. Implement exactly one candidate with minimal diff.
7. Prefer explicit fixtures/checkers over clever abstractions.
8. Run relevant checks.
9. Open a draft PR.
10. Add `CODEX AUDIT REQUEST` and the traceability report.
11. Comment: `@codex review for additive-only scope violations, oracle/revenue semantic regressions, accidental live-settlement behavior changes, scaling risks, security regressions, unnecessary complexity, failing or missing tests, rollback clarity, and repo-boundary violations`.
12. Do not merge or close the source issue.

## Required PR traceability report

Every implementation PR must include source issue and candidate ID, pre-implementation thesis summary, file-by-file change rationale, why each changed file is good for Arcturus, why it advances the repo endgame, why it should work, mass-user scaling analysis, security scope, simplicity analysis, tests/checks, skipped checks, rollback path, future creative paths not implemented, and `CODEX AUDIT REQUEST`.
