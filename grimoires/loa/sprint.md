# Sprint Plan: loa-arcturus — Proof-of-Revenue Oracle (Role 3 PoC)

**Version:** 1.0
**Date:** 2026-06-10
**Author:** Sprint Planner Agent (Loa `/plan`)
**PRD Reference:** grimoires/loa/prd.md
**SDD Reference:** grimoires/loa/sdd.md
**Spec (authoritative):** ROLE3-ORACLE-SPEC.md

---

## Executive Summary

Four sprints take loa-arcturus from empty repo to an externally-reproducible Proof-of-Revenue meter on Bepolia (80069). The plan follows the spec's **§8 build order exactly** (`ROLE3-ORACLE-SPEC.md:196-205`): scaffold + copy → payer persistence + Bepolia config → oracle ruleset/score → acceptance harness + proof-schema doc.

**Hard guardrails (every sprint):** read-only, fee-free, PoL-free; no on-chain fee/treasury logic; Roles 3 and 1 never welded; provenance honesty — UNVERIFIED facts stay UNVERIFIED until confirmed against source (`ROLE3-ORACLE-SPEC.md:11-16, 211-219`).

**Total Sprints:** 4
**Sequencing rule:** Sprint 2's payer-persistence migration (FR-3) **blocks everything downstream** (`ROLE3-ORACLE-SPEC.md:82, 200`).

> **Process note:** This is a *plan*. No application code, migrations, or file copies were performed this run. Implementation proceeds via `/run sprint-plan` (or per-sprint `/run sprint-N`), which wraps implement→review→audit with circuit-breaker protection. Sprint 1's curated copy from `../loa-freeside` is performed *during implementation*, never in planning.

---

## Sprint Overview

| Sprint | Theme | Key Deliverables | Dependencies | §8 step |
|--------|-------|------------------|--------------|---------|
| 1 | Scaffolding + curated copy | AGPL/DCO/NOTICE; ~6 files + migrations copied; clean-DB migrations green | None | 1, 2 |
| 2 | The Gap + Bepolia | `x402_settlements` payer persistence; Bepolia 80069 config-driven | Sprint 1 | 3, 4 |
| 3 | The Oracle | Qualified Revenue ruleset + realness score; anti-self-grading | Sprint 2 | 5 |
| 4 | Acceptance + Seam | self-broadcast seed, verify, docker, CI; PROOF-SCHEMA.md; E2E validation | Sprint 3 | 6, 7 |

---

## Sprint 1: AGPL Scaffolding & Curated Copy

**Scope:** MEDIUM (5 tasks)

### Sprint Goal
Stand up an AGPL-licensed repo with the curated loa-freeside primitives copied (headers intact) and all migrations applying green on a clean Postgres.

> **Status (2026-06-10): Sprint 1 implemented + reviewed + audited.** `[x]` = met & verified; `[~]` = met-pending-live-DB-run (no Postgres in impl env — static cross-check green, exact verify command in `migrations/PROVENANCE.md`). Report: `a2a/sprint-1/reviewer.md`; review: `engineer-feedback.md`; audit: `auditor-sprint-feedback.md`.

### Deliverables
- [x] `LICENSE` (AGPL-3.0), `NOTICE` (credits loa-freeside derivation), `CONTRIBUTING.md` (DCO sign-off).
- [x] ~6 TS files + chain adapters copied with original headers preserved (verbatim, md5-verified; + AGPL §5(a) provenance block).
- [~] Migrations copied AND made to apply on a clean DB (dependency chain resolved) — assembled + statically cross-checked green; live run deferred (no PG in env).
- [x] `usage_events` code↔schema drift reconciled so the real `settle()` path runs end-to-end (schema matches every settle() insert; verified statically).
- [x] "Leave behind" list verified absent (no Discord/themes/sietch/NOWPayments/constructs).

### Acceptance Criteria
- [x] `LICENSE` is full AGPL-3.0; `NOTICE` names loa-freeside as AGPL upstream; `CONTRIBUTING.md` requires DCO. CLA noted as later/optional only.
- [x] All files in the §2 list present with headers intact (`ROLE3-ORACLE-SPEC.md:60-68`).
- [~] `docker compose up` (or equivalent local Postgres) runs every migration with **no missing-function/role errors** — NOT run live (no PG/Docker in impl env); static object/column cross-check green; run `migrations/run-migrations.sh`.
- [~] A single hand-crafted settlement drives `settle()` to completion (Raw Revenue computable end-to-end) — every insert shape statically reconciled; smoke test in `run-migrations.sh`; not executed live.
- [x] The migration-resolution decision (strip RLS/tenant machinery vs port `0001–0008`) and the `usage_events` reconciliation are **documented with provenance** — no silent schema invention (`migrations/PROVENANCE.md`).
- [x] No "leave behind" dependencies present.

### Technical Tasks
- [x] Task 1.1: Create AGPL-3.0 LICENSE, NOTICE crediting loa-freeside, CONTRIBUTING.md with DCO → **[G-5, foundation]** (`loa-arcturus-k6r`)
- [x] Task 1.2: Curated copy of the ~6 TS files + chain adapters (`x402-settlement.ts`, `x402.routes.ts`, `credit-lot-service.ts`, `lot-entry-repository.ts`, chain adapters, `chain-provider.ts`) with headers preserved → **[G-1, G-2]** (`loa-arcturus-v6x`; +3 transitive deps flagged; chain-adapter sibling closure → Sprint 3 via `loa-arcturus-hkj`)
- [x] Task 1.3: Copy migrations (`0009/0010` + the load-bearing `0011 usage_events`) and pin package versions against real loa-freeside manifests → **[G-1]** (`loa-arcturus-4u3`)
- [x] Task 1.4: **[OPEN-1]** Resolve migration dependency chain (`prevent_mutation()`, `app.current_community_id()`, `arrakis_app/admin` from `0001–0008`) AND `usage_events` source/reference_id drift; document the chosen strip-down vs port decision → **[G-1, G-4]** (`loa-arcturus-2ri`; STRIP-DOWN)
- [x] Task 1.5: Verify "leave behind" exclusions; confirm clean-DB migration run is green → **[G-4]** (`loa-arcturus-2cz`; leave-behind green, clean-DB run deferred per above)

### Dependencies
- None (first sprint). Source `../loa-freeside` is read-only.

### Security Considerations
- **Trust boundaries:** copied code is AGPL upstream we control the provenance of; preserve headers for license compliance.
- **External dependencies:** pin versions from real manifests (Task 1.3), do not invent.
- **Sensitive data:** none introduced; do NOT copy any loa-freeside secrets/config (explicitly leave the 60 KB `.loa.config.yaml` behind).

### Risks & Mitigation
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Migrations fail on clean DB (missing 0001–0008 helpers/roles) | High | High | Task 1.4 strip-down vs port decision; gate on green compose |
| `usage_events` insert fails (no source/reference_id cols) | High | High | Task 1.4 reconciliation; verified at `0011_usage_events_pg.sql` vs `x402-settlement.ts:229-232` |
| Accidentally pulling "leave behind" code | Med | Med | Task 1.5 explicit exclusion check |

### Success Metrics
- 100% of §2 files present with headers; migrations green on clean DB; one settlement completes end-to-end.

---

## Sprint 2: The Gap (Payer Persistence) + Bepolia Config

**Scope:** MEDIUM (5 tasks)

### Sprint Goal
Persist the payer (`x402_settlements`), unblocking Qualified Revenue, and make chain/token config-driven with Bepolia 80069 added — using the self-broadcast settlement model.

### Deliverables
- [ ] `x402_settlements` migration (Option B) with payer + indexes + `UNIQUE(chain_id, tx_hash)`.
- [ ] `settle()` writes `payer_address` = on-chain `from` for every settlement.
- [ ] Bepolia 80069 added to `CHAIN_CONFIGS`; facilitator block config-driven (no hardcoded base/USDC/8453).
- [ ] Self-broadcast model documented; HONEY token UNVERIFIED item carried forward as a confirm task.

### Acceptance Criteria
- [ ] Migration creates `x402_settlements` per SDD §3.2 Option B.
- [ ] Every settlement persists `payer_address`; no payer discarded on the settle path (replaces `payload='{}'` behavior).
- [ ] `UNIQUE(chain_id, tx_hash)` rejects double-counting.
- [ ] Bepolia present: `chain_id:80069`, RPC URLs, explorer `https://bepolia.beratrail.io`; 80094 retained; token config supports HONEY (also accept USDC).
- [ ] No `chain:'base'`/`token:'USDC'`/`chainId=8453` literals remain in the facilitator path.
- [ ] **[UNVERIFIED]** HONEY token standard / Bepolia contract address recorded as an explicit confirm-against-source task — NOT resolved by guessing (`ROLE3-ORACLE-SPEC.md:134-136, 292-297`).

### Technical Tasks
- [ ] Task 2.1: Author `x402_settlements` migration (Option B schema) → **[G-1]**
- [ ] Task 2.2: Modify `settle()` to insert `x402_settlements` alongside `usage_events` (data already in `X402PaymentProof`, `x402-settlement.ts:42-58`) → **[G-1]**
- [ ] Task 2.3: Add Bepolia 80069 `ChainConfig` (confirm symbol/decimals/RPC against Berachain docs — OPEN-6) → **[G-2]**
- [ ] Task 2.4: Replace hardcoded facilitator chain/token with config-driven selection (`x402.routes.ts:76,111-113,168-170`) → **[G-2]**
- [ ] Task 2.5: Document self-broadcast settlement model + record HONEY-standard UNVERIFIED confirm task → **[G-2, G-5]**

### Dependencies
- Sprint 1: copied code + green migrations.

### Security Considerations
- **Trust boundaries:** on-chain `from` is the anti-sybil trust anchor — self-broadcast keeps it real (`ROLE3-ORACLE-SPEC.md:128-132`). Confirm `tx_hash` by chain read before persisting.
- **Replay:** `UNIQUE(chain_id, tx_hash)` + existing nonce dedup.
- **No fee/treasury logic** introduced.

### Risks & Mitigation
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Assuming a HONEY auth-transfer flow that doesn't exist | Med | Med | Self-broadcast avoids it; UNVERIFIED confirm task (Task 2.5) |
| Bepolia RPC/symbol wrong | Med | Low | Task 2.3 confirm against Berachain docs (OPEN-6) |

### Success Metrics
- Payer persisted on 100% of settlements; Bepolia readable by the oracle; zero hardcoded base/USDC literals.

---

## Sprint 3: The Oracle — Qualified Revenue Ruleset & Realness Score

**Scope:** LARGE (7 tasks)

### Sprint Goal
Compute, per service, Raw Revenue, Qualified Revenue, and a realness score ∈ [0,1] via the §5 filter stack, with anti-self-grading enforced and open methodology.

> **Status (2026-06-11): Sprint 3 implemented + reviewed.** `[x]` = met & LIVE-verified against a throwaway Postgres 16 (migrations 0001→0005 green; `verify-live.ts` showed anti-self-grading $80 flagged/excluded → svc-honeyjar score 0.20, farm-reduces svc-thirdparty to ≈0.50, clean survives, byte-identical determinism across two processes). Report: `a2a/sprint-3/reviewer.md`; review: `a2a/sprint-3/engineer-feedback.md` (All good w/ noted non-blocking concerns); methodology: `docs/ORACLE-METHODOLOGY.md`. Awaiting `/audit-sprint`.

### Deliverables
- [x] Oracle module reading `x402_settlements` + `IChainProvider`, emitting `{raw_micro, qualified_micro, score, flagged_affiliated_micro, methodology}`.
- [x] Filter stack: affiliate exclusion, dust floor, circular-flow (cycle detection), wallet-age weighting, external-origin bonus.
- [x] Anti-self-grading: 0xhoneyjar services indexed + held to filter; affiliated revenue labeled + excluded from headline.
- [x] `MockChainProvider` for keyless filter-logic runs.

### Acceptance Criteria
- [x] Per-service output with `score ∈ [0,1]`; Raw, Qualified, score published side by side.
- [x] Filters 1–3 (affiliate / dust / circular-flow) implemented; cycle-detection + funding-graph analysis built on `getActivity` (acknowledged net-new, `ROLE3-ORACLE-SPEC.md:301-305`).
- [x] Filters 4–5 (wallet-age weighting / external-origin bonus) implemented; **[OPEN-5]** the weighting-vs-binary reconciliation against the score formula is documented and the headline stays reproducible.
- [x] Anti-self-grading verified: a 0xhoneyjar affiliated payer is flagged + excluded from headline (`ROLE3-ORACLE-SPEC.md:164-167`).
- [x] Methodology is open & reproducible (emitted in the `methodology` field / docs).
- [x] `MockChainProvider` produces deterministic profiles for the same synthetic graph.

### Technical Tasks
- [x] Task 3.1: Oracle module skeleton + `computeServiceRevenue()` reading `x402_settlements` (Raw Revenue) → **[G-3]** (`loa-arcturus-208`)
- [x] Task 3.2: Filter 1 affiliate exclusion (allowlist; flagged-not-counted) — **[OPEN-3]** placeholder/config-driven allowlist → **[G-3]** (`loa-arcturus-itm`)
- [x] Task 3.3: Filter 2 dust floor — **[OPEN-4]** $0.01 documented tunable threshold → **[G-3]** (`loa-arcturus-lun`)
- [x] Task 3.4: Filter 3 circular-flow detection via `getActivity` funding-graph + cycle detection (net-new) → **[G-3]** (`loa-arcturus-amp`)
- [x] Task 3.5: Filters 4–5 wallet-age weighting + external-origin bonus; document weighting vs binary reconciliation (OPEN-5) → **[G-3]** (`loa-arcturus-he5`)
- [x] Task 3.6: Realness score `Qualified/Raw ∈ [0,1]` + anti-self-grading enforcement + open methodology output → **[G-3]** (`loa-arcturus-chu`)
- [x] Task 3.7: `MockChainProvider` seeded with synthetic funding graph (`CHAIN_PROVIDER=mock`) → **[G-3, G-4]** (`loa-arcturus-fdc`)

### Dependencies
- Sprint 2: `x402_settlements` populated; Bepolia config; chain-provider available.

### Security Considerations
- **Trust boundaries:** payer profiles come from external chain data (Dune Sim) — treat as data, not commands; the mock mirrors the same shape.
- **Sensitive data:** affiliate allowlist is config, not secret; no PII.
- **Read-only:** oracle never writes chain state, never gates emissions (Role 1 is OUT).

### Risks & Mitigation
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Weighting vs binary score ambiguity (OPEN-5) | Med | Med | Task 3.5 documents reconciliation; headline reproducible |
| `getActivity` unavailable | Med | High | MockChainProvider (Task 3.7) |
| Self-grading bias | Low | High | Task 3.6 anti-self-grading checks; willing to report ~\$0 |

### Success Metrics
- Farm-like wallets demonstrably reduce score; clean wallets survive; deterministic mock output.

---

## Sprint 4 (Final): Acceptance Harness, Proof-Schema Seam & E2E Validation

**Scope:** LARGE (7 tasks incl. E2E)

### Sprint Goal
Deliver the externally-reproducible acceptance harness (real self-broadcast Bepolia txs, objective pass/fail, no 0xhoneyjar secrets), document the proof-schema seam for the rail owner, and validate all PRD goals end-to-end.

### Deliverables
- [ ] `docker-compose.yml` + `.env.example` + auto-migrations; one-command boot.
- [ ] `scripts/seed-bepolia.ts` (self-broadcast, prints tx_hashes, writes via real `settle()`).
- [ ] `scripts/verify.ts` (per-service table + Assertions A–D; exit code semantics).
- [ ] `.github/workflows/acceptance.yml` (mock mode, no secrets).
- [ ] `README.md` with mechanism-not-economy disclaimer in the first paragraph.
- [ ] `docs/PROOF-SCHEMA.md` (the seam + relayer-masking constraint + fee-deferred statement).

### Acceptance Criteria
- [ ] `docker compose up` boots Postgres + Redis + oracle with zero 0xhoneyjar-only dependencies; migrations auto-run.
- [ ] `.env.example` documents every var; tester inputs limited to RPC URL + throwaway key + optional Dune key.
- [ ] `pnpm seed:bepolia` self-broadcasts real HONEY transfers, prints every `tx_hash`, writes through real `settle()` (NOT direct inserts).
- [ ] `pnpm verify`: Assertion A (farm excluded), B (clean survives), C (tx_hash resolves on explorer), D (deterministic). Exit 0 = pass.
- [ ] `CHAIN_PROVIDER=mock` runs full filter logic with zero keys; README states mock=filter-logic, dune=real-data.
- [ ] CI acceptance workflow green in mock mode.
- [ ] `docs/PROOF-SCHEMA.md` specifies `{tx_hash, chain_id, from, amount, nonce}`, the mandatory client-signed-payer (relayer-masking) constraint, and the fee-deferred/out-of-scope statement.
- [ ] No fee/treasury/PoL code anywhere; README makes no live-economy claim.

### Technical Tasks
- [ ] Task 4.1: `docker-compose.yml` + `.env.example` + auto-migrations on boot → **[G-4]**
- [ ] Task 4.2: `scripts/seed-bepolia.ts` — clean + farm-like wallets, self-broadcast, print tx_hashes, real `settle()` path → **[G-4]**
- [ ] Task 4.3: `scripts/verify.ts` — per-service table + Assertions A–D + exit codes → **[G-3, G-4]**
- [ ] Task 4.4: `.github/workflows/acceptance.yml` (mock mode, no secrets) → **[G-4]**
- [ ] Task 4.5: `README.md` quickstart + mechanism-not-economy disclaimer first paragraph → **[G-4]**
- [ ] Task 4.6: `docs/PROOF-SCHEMA.md` — seam + relayer-masking constraint + fee-deferred statement → **[G-5]**
- [ ] Task 4.E2E: End-to-End Goal Validation (P0) → **[G-1, G-2, G-3, G-4, G-5]**

### Task 4.E2E: End-to-End Goal Validation
**Priority:** P0 (Must Complete)
**Goal Contribution:** All goals.

| Goal ID | Goal | Validation Action | Expected Result |
|---------|------|-------------------|-----------------|
| G-1 | Persist payer identity | Run seed → inspect `x402_settlements` | `payer_address` populated = on-chain `from` for every tx |
| G-2 | Config-driven chain + Bepolia 80069 | Boot, point at Bepolia, settle | Oracle reads 80069 settlements; no hardcoded base/USDC |
| G-3 | Qualified Revenue + score | `pnpm verify` | Assertions A & B pass; score ∈ [0,1] |
| G-4 | External reproducibility | Clean-machine boot + seed + verify (mock mode, no secrets) | Exit 0; Assertions A–D pass; CI green |
| G-5 | Proof-schema seam | Read `docs/PROOF-SCHEMA.md` | Seam + relayer-masking constraint + fee-deferred present |

**Acceptance Criteria:**
- [ ] Each goal validated with documented evidence (tx_hashes, verify output, file presence).
- [ ] Data flows end-to-end: self-broadcast → settle → persist → oracle → verify.
- [ ] No goal marked "not achieved" without explicit justification.
- [ ] Mechanism-not-economy line intact; no PoL/fee code present.

### Dependencies
- Sprint 3: oracle + score + MockChainProvider.

### Security Considerations
- **Trust boundaries:** tester supplies only their own throwaway key; harness needs no 0xhoneyjar secret. CI runs keyless (mock).
- **External verification:** every counted tx must resolve on the public Bepolia explorer (Assertion C).
- **No fee/treasury/PoL** code paths.

### Risks & Mitigation
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Tester can't reproduce (hidden dependency) | Med | High | Zero-0xhoneyjar-dep rule; CI proves keyless boot |
| Non-determinism breaks Assertion D | Med | High | Fixed synthetic graph in mock; deterministic seed |
| Faucet/RPC unavailable to tester | Low | Med | Document faucet + public RPC; mock fallback unblocks |

### Success Metrics
- Clean-machine exit-0 run; CI green; all 5 goals validated with evidence.

---

## Risk Register

| ID | Risk | Sprint | Prob | Impact | Mitigation | Owner |
|----|------|--------|------|--------|------------|-------|
| R1 | Copied migrations fail on clean DB + usage_events drift (OPEN-1) | 1 | High | High | Strip-down vs port decision, documented; gate on green compose | maintainer |
| R2 | Payer not persisted / discarded | 2 | Low | High | FR-3 Option B + UNIQUE constraint; replaces `payload='{}'` | maintainer |
| R3 | HONEY token standard assumed wrong (UNVERIFIED) | 2 | Med | Med | Self-broadcast avoids; confirm-against-source task | maintainer/rail owner |
| R4 | Filters 4–5 weighting ambiguity (OPEN-5) | 3 | Med | Med | Document reconciliation; reproducible headline | maintainer |
| R5 | Anti-sybil blocked without Dune key | 3,4 | Med | High | MockChainProvider, keyless filter logic | maintainer |
| R6 | Relayer/payer masking (thesis-level) | 4 | Med | High | Self-broadcast; hand rail owner the constraint | rail owner |
| R7 | Mechanism mistaken for economy | 4 | Med | High | README disclaimer + §10.6 framing | maintainer |
| R8 | Role 3 welded to Role 1 prematurely | all | Low | High | Read-only, PoL-free; §9 sequencing discipline | maintainer |

---

## Success Metrics Summary

| Metric | Target | Measurement | Sprint |
|--------|--------|-------------|--------|
| Payer persisted | 100% of settlements | inspect `x402_settlements` | 2 |
| Bepolia in CHAIN_CONFIGS | present (80069) | config read | 2 |
| Score determinism | identical on re-run | Assertion D | 4 |
| Tester external inputs | ≤ 3 | `.env.example` | 4 |
| Fee/treasury/PoL code | 0 | audit | all |
| CI acceptance | green (mock) | GitHub Action | 4 |

---

## Dependencies Map

```
Sprint 1 ──────────▶ Sprint 2 ──────────▶ Sprint 3 ──────────▶ Sprint 4
   │                    │                    │                    │
   └─ scaffold+copy     └─ THE GAP (FR-3)    └─ oracle+score      └─ harness+seam+E2E
      migrations green     blocks all           anti-self-grade      external reproducibility
```

---

## Appendix

### A. PRD Feature → Sprint Mapping

| PRD Feature | Sprint | §8 step |
|-------------|--------|---------|
| FR-1 AGPL scaffolding | 1 | 1 |
| FR-2 / FR-2a curated copy + migration resolution | 1 | 2 |
| FR-3 payer persistence (THE GAP) | 2 | 3 |
| FR-4 Bepolia/HONEY config | 2 | 4 |
| FR-5 oracle ruleset + score | 3 | 5 |
| FR-6 acceptance harness | 4 | 6 |
| FR-7 proof-schema seam | 4 | 7 |
| (Role 1 PoL gating) | — | 8 — OUT OF SCOPE |

### B. SDD Component → Sprint Mapping

| SDD Component | Sprint |
|---------------|--------|
| §3.3 copied tables + dependency resolution | 1 |
| §3.2 `x402_settlements` payer store | 2 |
| §5.3 `CHAIN_CONFIGS` Bepolia | 2 |
| §4 oracle ruleset + score | 3 |
| §7 acceptance harness | 4 |
| §6 proof-schema seam | 4 |

### C. PRD Goal Mapping

| Goal ID | Goal | Contributing Tasks | Validation Task |
|---------|------|--------------------|-----------------|
| G-1 | Persist payer identity | 1.2, 1.3, 1.4, 2.1, 2.2 | 4.E2E |
| G-2 | Config-driven chain + Bepolia 80069 | 1.2, 2.3, 2.4, 2.5 | 4.E2E |
| G-3 | Qualified Revenue + realness score | 3.1–3.7, 4.3 | 4.E2E |
| G-4 | External reproducibility | 1.4, 1.5, 3.7, 4.1–4.5 | 4.E2E |
| G-5 | Proof-schema seam | 1.1, 2.5, 4.6 | 4.E2E |

**Goal Coverage Check:**
- [x] All PRD goals have ≥1 contributing task.
- [x] All goals validated in final sprint (Task 4.E2E).
- [x] No orphan tasks.

**Per-Sprint Goal Contribution:**
- Sprint 1: G-1 (partial: schema), G-2 (partial: copy), G-4 (partial: clean boot), G-5 (partial: license)
- Sprint 2: G-1 (complete: persistence), G-2 (complete: config)
- Sprint 3: G-3 (complete: oracle+score), G-4 (partial: mock)
- Sprint 4: G-4 (complete: harness), G-5 (complete: seam), E2E of all

### D. Open Questions (tracked from PRD/SDD)

| ID | Question | Sprint | Status |
|----|----------|--------|--------|
| OPEN-1 | Migration dependency chain + usage_events drift | 1 | Open |
| OPEN-2 | HONEY token standard + Bepolia contract (UNVERIFIED) | 2 | Open |
| OPEN-3 | Affiliate allowlist seed | 3 | Open |
| OPEN-4 | Dust-floor threshold | 3 | Open |
| OPEN-5 | Filters 4–5 weighting vs binary score | 3 | Open |
| OPEN-6 | Bepolia symbol/decimals + public RPC list | 2 | Open |

---

*Generated by Sprint Planner Agent — Loa `/plan`. Spec ROLE3-ORACLE-SPEC.md is authoritative.*
