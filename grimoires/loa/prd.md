# Product Requirements Document: loa-arcturus — Proof-of-Revenue Oracle (Role 3 PoC)

**Version:** 1.0
**Date:** 2026-06-10
**Author:** PRD Architect Agent (Loa `/plan`)
**Status:** Draft
**Source of truth:** `ROLE3-ORACLE-SPEC.md` (repo root) — this PRD restates the spec into Loa planning form. Where they ever disagree, the spec wins.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Goals & Success Metrics](#goals--success-metrics)
4. [User Personas & Use Cases](#user-personas--use-cases)
5. [Functional Requirements](#functional-requirements)
6. [Non-Functional Requirements](#non-functional-requirements)
7. [Technical Considerations](#technical-considerations)
8. [Scope & Prioritization](#scope--prioritization)
9. [Success Criteria](#success-criteria)
10. [Risks & Mitigation](#risks--mitigation)
11. [Appendix](#appendix)

---

## Executive Summary

loa-arcturus is an open-source (AGPL-3.0), anti-sybil **Proof-of-Revenue oracle** for the Berachain agent economy. It ingests x402 payment settlements, persists the payer wallet, profiles that wallet on-chain, applies an anti-farming filter, and publishes **Qualified Revenue** (real arms-length demand) vs **Raw Revenue** (everything) per service, plus a per-service **realness score** ∈ [0,1] with open methodology.

> From `ROLE3-ORACLE-SPEC.md:22-28`: *"An open-source, anti-sybil **revenue-truth oracle** for the Berachain agent economy. … This is the *honesty layer* no existing x402 dashboard provides — every competitor does discovery/uptime, none does real-vs-farm."*

This PoC is a **read-only measurement layer on Bepolia (chain_id 80069)**. It collects **no fees** and contains **no on-chain fee/treasury logic** (`ROLE3-ORACLE-SPEC.md:11-16`). The deliverable is **"the meter works," NOT "a real economy exists."**

> From `ROLE3-ORACLE-SPEC.md:30-31`: *"**This PoC proves the meter works — NOT that an economy exists yet.** Present it as a mechanism demo on seeded data, never as 'Berachain has \$X of real agent revenue.'"*

The headline acceptance test is **external reproducibility**: an external engineer boots the repo on their own machine with no 0xhoneyjar secrets, seeds real self-broadcast Bepolia transactions, and reads an objective pass/fail — *verifying the meter is real without trusting the author* (`ROLE3-ORACLE-SPEC.md:225-229`).

**This is a derivation, not a greenfield build.** The off-chain measurement primitives are curated-copied (AGPL→AGPL) from the sibling repo `../loa-freeside` (`ROLE3-ORACLE-SPEC.md:59-68`). The net-new work is: payer persistence, Bepolia config, the oracle ruleset/score, and the external acceptance harness.

---

## Problem Statement

### The Problem

Existing x402 dashboards measure discovery and uptime; **none distinguishes real arms-length demand from wash/farm activity** (`ROLE3-ORACLE-SPEC.md:27-28`). An agent economy whose "revenue" is mostly self-funded circular flow looks identical, on every existing dashboard, to one with genuine outside demand. That is the "aGDP dishonesty" the project sets out to expose (`ROLE3-ORACLE-SPEC.md:217-219`).

### Current State (verified against `../loa-freeside` source)

- Raw Revenue **is** computable today — `settle()` records `actual_micro` into `usage_events` (`../loa-freeside/packages/services/x402-settlement.ts:227-234`).
- Qualified Revenue is **impossible** today because the payer wallet is discarded:
  - `verifyNonceUnique()` writes `webhook_events.payload = '{}'` — the proof is thrown away (`../loa-freeside/packages/services/x402-settlement.ts:155-156`).
  - `usage_events` stores `community_id, amount_micro, source, reference_id=tx_hash` — **no payer column** (`../loa-freeside/packages/services/x402-settlement.ts:229-232`).
  - `proof.from` is parsed and validated but never persisted (`../loa-freeside/packages/routes/x402.routes.ts:183,190`).

> From `ROLE3-ORACLE-SPEC.md:78-80`: *"So Raw Revenue is computable today, but **Qualified Revenue is impossible** without the payer wallet."*

### Desired State

A booted oracle that, given real Bepolia settlements, reports per service: Raw Revenue, Qualified Revenue, and a realness score, with farm-like wallets demonstrably excluded from Qualified and every counted `tx_hash` independently verifiable on the Bepolia explorer.

---

## Goals & Success Metrics

### Primary Goals

| ID | Goal | Measurement | Validation Method |
|----|------|-------------|-------------------|
| G-1 | **Persist the missing payer identity** so Qualified Revenue becomes computable | `x402_settlements.payer_address` is populated by the real `settle()` path | Migration applied on boot; a settled tx produces a row with the on-chain `from` |
| G-2 | **Make the oracle chain/token-config-driven and add Bepolia 80069** | Bepolia present in `CHAIN_CONFIGS`; facilitator block no longer hardcodes `base`/`USDC` | Oracle reads Bepolia settlements; config selects chain/token (`ROLE3-ORACLE-SPEC.md:116-122`) |
| G-3 | **Compute Qualified Revenue + realness score** per service via the §5 filter stack | Per-service `{raw, qualified, score∈[0,1]}` output | Assertions A & B: farm wallets excluded, clean wallets survive (`ROLE3-ORACLE-SPEC.md:259-260`) |
| G-4 | **External reproducibility** — a stranger boots, seeds real Bepolia txs, and reads objective pass/fail without trusting the author | `docker compose up` + `seed` + `verify` exit 0 on a clean machine | Assertions A–D pass; CI runs the harness in mock mode (`ROLE3-ORACLE-SPEC.md:256-264`) |
| G-5 | **Document the proof-schema seam** so the rail owner's future facilitator targets a stable interface | `docs/PROOF-SCHEMA.md` exists and specifies `{ tx_hash, chain_id, from, amount, nonce }` | rail owner can read the seam + the relayer-masking constraint (`ROLE3-ORACLE-SPEC.md:42-44,286`) |

### Key Performance Indicators (KPIs)

| Metric | Baseline | Target | Goal ID |
|--------|----------|--------|---------|
| Payer persisted per settlement | 0% (discarded) | 100% | G-1 |
| Bepolia 80069 in `CHAIN_CONFIGS` | absent | present | G-2 |
| Realness score determinism (`verify` re-run) | n/a | identical scores (Assertion D) | G-3, G-4 |
| Tester external inputs required | n/a | ≤ 3 (RPC URL, throwaway key, optional Dune key) | G-4 |
| Fees / treasury logic in PoC | must be 0 | 0 | (all) |

### Constraints

- **PoC is read-only, fee-free, PoL-free** (`ROLE3-ORACLE-SPEC.md:11-16, 211-216`). No on-chain fee/treasury logic, no PoL-Next vault wiring.
- **Roles 3 and 1 never welded** — wiring the realness score into PoL emission gating is explicitly OUT of this PoC (`ROLE3-ORACLE-SPEC.md:205, 211-213`).
- **Provenance honesty is the product.** No unverified technical fact may be stated as sourced (see UNVERIFIED items in §7 and Appendix C).
- **AGPL-3.0**, DCO in CONTRIBUTING, NOTICE crediting derivation from loa-freeside (`ROLE3-ORACLE-SPEC.md:57-60`).

---

## User Personas & Use Cases

### Primary Persona: External Engineer (the external tester)

- **Role:** Skeptical reviewer evaluating whether the meter is real.
- **Goal:** Verify the oracle works *without trusting 0xhoneyjar* — no access to their secrets, DB, or hosted services.
- **Behaviors:** Clones repo, reads README disclaimer, runs `docker compose up`, supplies own Bepolia RPC + throwaway funded key, runs seed + verify, opens `tx_hash`es on the Bepolia explorer.

### Secondary Persona: 0xhoneyjar Oracle Operator / Maintainer

- **Role:** Builds and runs the oracle; indexes all services including 0xhoneyjar's own.
- **Behavior constraint (anti-self-grading):** holds 0xhoneyjar's own services to the same filter, labels + excludes affiliated revenue from the headline, and is *willing to report 0xhoneyjar's own real revenue is ~\$0* (`ROLE3-ORACLE-SPEC.md:164-167`).

### Use Cases

#### UC-1: External tester verifies the meter
**Actor:** External Engineer
**Preconditions:** Docker installed; a Bepolia RPC URL; a faucet-funded throwaway key.
**Flow:**
1. `docker compose up` → Postgres + Redis + oracle; migrations auto-run (incl. payer-persistence).
2. `pnpm seed:bepolia` → generates clean + farm-like payer wallets, self-broadcasts real HONEY transfers, writes proofs through the real `settle()` path, prints every `tx_hash`.
3. `pnpm verify` → prints per-service Raw/Qualified/score table + machine-checkable assertions.
**Postconditions:** Exit code 0 = all assertions pass; the tester independently confirms each `tx_hash` on the explorer.
**Acceptance Criteria:**
- [ ] Farm-like wallets' revenue excluded from Qualified (Assertion A).
- [ ] Clean/external-funded wallets survive into Qualified (Assertion B).
- [ ] Every counted `tx_hash` resolves on the Bepolia explorer (Assertion C).
- [ ] Re-running `verify` is deterministic (Assertion D).

#### UC-2: Oracle classifies a settlement
**Actor:** Oracle Operator
**Preconditions:** `x402_settlements` populated; chain-provider available (real Dune Sim or `MockChainProvider`).
**Flow:** Oracle reads settlements for an `agent_id`, computes Raw Revenue, applies the §5 filter stack (affiliate exclusion → dust floor → circular-flow → wallet-age weighting → external-origin bonus), sums Qualified Revenue, derives score = Qualified/Raw.
**Postconditions:** Per-service `{raw, qualified, score}` published with open methodology.

---

## Functional Requirements

> Build-order alignment is noted per FR. The §8 build order is the canonical sequence (`ROLE3-ORACLE-SPEC.md:196-205`).

### FR-1: AGPL repo scaffolding (§8.1)
**Priority:** Must Have
**Description:** Create `LICENSE` (AGPL-3.0), `NOTICE` crediting derivation from loa-freeside, DCO sign-off requirement in `CONTRIBUTING.md` (`ROLE3-ORACLE-SPEC.md:57-60, 198`).
**Acceptance Criteria:**
- [ ] `LICENSE` is AGPL-3.0 full text.
- [ ] `NOTICE` names loa-freeside as the AGPL upstream and preserves attribution.
- [ ] `CONTRIBUTING.md` requires DCO sign-off; a CLA is noted as a *later, optional* consideration (`ROLE3-ORACLE-SPEC.md:57-58`).
**Dependencies:** none.

### FR-2: Curated copy of measurement primitives + migrations (§8.2)
**Priority:** Must Have
**Description:** Copy (NOT fork) the ~6 TS files + migrations from loa-freeside with file headers intact (AGPL→AGPL) (`ROLE3-ORACLE-SPEC.md:60-68`). The exact source list:
- `packages/services/x402-settlement.ts`
- `packages/routes/x402.routes.ts`
- `packages/services/credit-lot-service.ts`
- `packages/adapters/storage/lot-entry-repository.ts`
- chain-provider adapter (`dune-sim-client.ts` / `hybrid-provider.ts` / `provider-factory.ts`)
- `packages/core/ports/chain-provider.ts` (IChainProvider interface)
- migrations: `webhook_events` + `crypto_payments` + credit-lot tables

**Leave behind** (`ROLE3-ORACLE-SPEC.md:69-70`): agent gateway, ensemble accounting, Discord/themes/sietch, NOWPayments payout machinery, constructs, the 60 KB `.loa.config.yaml`.

**Acceptance Criteria:**
- [ ] All listed files present with original AGPL headers preserved.
- [ ] No code from the "leave behind" list is pulled in (verify no Discord/NOWPayments/sietch deps).
- [ ] **[OPEN-1 — see Appendix C]** The migration *dependency chain* and the `usage_events` schema are resolved (the §2 list under-specifies what `settle()` actually needs to run — see FR-2a).

### FR-2a: Resolve migration dependency + usage_events drift (derived; blocks G-1/G-4)
**Priority:** Must Have
**Description:** Two source-verified gaps the §2 copy list does not by itself close. These are **confirm-against-source** tasks, not to be guessed:
1. **Migration dependency chain.** The credit-lot / webhook / usage migrations the spec wants copied depend on helper functions and roles defined in *earlier* loa-freeside migrations (`prevent_mutation()`, `app.current_community_id()`, roles `arrakis_app` / `arrakis_admin`) found in `0001_rls_policies.sql … 0008_tenant_context_guard.sql`. A clean Postgres will reject the copied migrations without those prerequisites. The PoC must decide: port the prerequisite DDL, or strip the RLS/trigger machinery the PoC does not need.
2. **`usage_events` code↔schema drift.** `settle()` inserts `usage_events(community_id, amount_micro, source, reference_id, created_at)` (`x402-settlement.ts:229-232`), but `0011_usage_events_pg.sql` defines **no `source`/`reference_id` columns** and requires `nft_id`/`pool_id` NOT NULL. As copied, the insert fails — and §10.3 requires `settle()` to run end-to-end. Note `usage_events` (migration 0011) is **not** in the spec's §2 file list but is load-bearing for Raw Revenue.
**Acceptance Criteria:**
- [ ] A clean `docker compose up` runs all migrations green with no missing-function/role errors.
- [ ] A single real settlement drives the real `settle()` path to completion (Raw Revenue is computable end-to-end).
- [ ] The resolution is documented (which prerequisite DDL was ported vs stripped, and how the `usage_events` shape was reconciled) — provenance preserved, no silent schema invention.
**Dependencies:** FR-2.

### FR-3: Payer-persistence migration — THE GAP (§8.3, blocks everything downstream)
**Priority:** Must Have (P0)
**Description:** Durably persist `proof.from`. The spec offers two options (`ROLE3-ORACLE-SPEC.md:84-112`):
- **Option A (minimal):** write the full proof into the existing `webhook_events.payload` JSONB instead of `'{}'`.
- **Option B (queryable — recommended for the oracle):** new `x402_settlements` table with `payer_address`, `chain_id`, `tx_hash`, `nonce`, `quoted_micro`, `actual_micro`, `UNIQUE(chain_id, tx_hash)`, indexes on `payer_address` and `(agent_id, settled_at)`. Populate inside `settle()` alongside the existing `usage_events` insert.
**Acceptance Criteria:**
- [ ] Migration creates the durable payer store (Option B recommended).
- [ ] `settle()` writes `payer_address` = on-chain `from` for every settlement.
- [ ] `UNIQUE(chain_id, tx_hash)` prevents double-counting.
- [ ] No payer data is discarded anywhere on the settle path.
**Dependencies:** FR-2, FR-2a. **Blocks:** FR-5 (oracle), FR-6 (harness).

### FR-4: Berachain / HONEY config + Bepolia 80069 (§8.4)
**Priority:** Must Have
**Description:** Replace the hardcoded Base/USDC facilitator block with config-driven chain/token, and **add Bepolia 80069 to `CHAIN_CONFIGS`** (`ROLE3-ORACLE-SPEC.md:116-136`).
**Verified facts:** `x402.routes.ts` hardcodes `chain:'base'`, `token:'USDC'`, default `chainId=8453` (`../loa-freeside/packages/routes/x402.routes.ts:76,111-113,168-170`). `CHAIN_CONFIGS` ships 80094/1/137/42161/8453 but **NOT 80069** (`../loa-freeside/packages/core/ports/chain-provider.ts:398-459`).
**Acceptance Criteria:**
- [ ] Bepolia added as a new `ChainConfig`: `chain_id: 80069`, RPC URLs, explorer `https://bepolia.beratrail.io`.
- [ ] Berachain mainnet 80094 retained; token config supports `HONEY` (also accept `USDC`).
- [ ] Facilitator block reads chain/token from config — no hardcoded `base`/`USDC`/`8453`.
- [ ] **Settlement model = direct self-broadcast** (no managed facilitator, no thirdweb): payer broadcasts its own HONEY transfer, server reads the chain; on-chain `from` == real payer (`ROLE3-ORACLE-SPEC.md:128-132`).
- [ ] **[UNVERIFIED — carry forward]** HONEY's token standard / Bepolia contract address is confirmed against the Berachain docs/faucet *before* any transfer-with-authorization flow is assumed. The self-broadcast model does not depend on this (`ROLE3-ORACLE-SPEC.md:134-136, 292-297`).
**Dependencies:** FR-2.

### FR-5: Oracle module — Qualified Revenue ruleset + realness score (§8.5)
**Priority:** Must Have
**Description:** Read `x402_settlements` (revenue + payer) and the chain-provider (payer on-chain profile) and compute per service (`ROLE3-ORACLE-SPEC.md:140-167`):
- **Raw Revenue** = Σ `actual_micro` over window.
- **Qualified Revenue** = Σ `actual_micro` over settlements passing the filter stack:
  1. Affiliate exclusion (allowlist of 0xhoneyjar/operator/team wallets — flagged, not counted).
  2. Dust floor (drop below micro threshold).
  3. Circular-flow detection (drop where payer funded by / routes back to recipient service wallet — cycle detection on funding graph).
  4. Wallet-age / funding-history weighting (down-weight fresh/affiliate-funded, up-weight aged/independent).
  5. External-origin bonus (up-weight CEX/bridge/unrelated-DeFi funding).
- **Realness score** = Qualified / Raw ∈ [0,1].
**Acceptance Criteria:**
- [ ] Per-service output `{raw_micro, qualified_micro, score}` with `score∈[0,1]`.
- [ ] Headline metric = services whose Qualified Revenue survives with zero subsidy / zero emissions (`ROLE3-ORACLE-SPEC.md:161-162`).
- [ ] **Anti-self-grading:** 0xhoneyjar's own services indexed and held to the same filter; affiliated revenue visibly labeled + excluded from headline (`ROLE3-ORACLE-SPEC.md:164-167`).
- [ ] Methodology is open and reproducible (published alongside scores).
- [ ] Cycle-detection + funding-graph analysis built on top of `getActivity` — acknowledged as **net-new code**, not provided by the port (`ROLE3-ORACLE-SPEC.md:301-305`).
**Dependencies:** FR-3, FR-4.

### FR-6: Real self-broadcast Bepolia seed + external acceptance harness (§8.6 / §10)
**Priority:** Must Have
**Description:** The PoC is demonstrated via **real self-broadcast Bepolia (80069) transactions** an external tester verifies independently — NOT synthetic DB fixtures (`ROLE3-ORACLE-SPEC.md:231-237`).
**Acceptance Criteria (objective, one screen — `ROLE3-ORACLE-SPEC.md:256-264`):**
- [ ] `docker compose up` brings up Postgres + Redis + oracle; migrations auto-run; zero 0xhoneyjar-only dependencies.
- [ ] `.env.example` documents every variable; tester supplies only: Bepolia RPC URL, a funded throwaway key (faucet: bepolia.faucet.berachain.com), optional Dune Sim key.
- [ ] `pnpm seed:bepolia` generates clean + farm-like wallets, self-broadcasts real HONEY transfers against 1–3 demo services, prints every `tx_hash`, writes proofs through the real `settle()` path (NOT direct table inserts).
- [ ] `pnpm verify` prints per-service Raw/Qualified/score + Assertions A–D; exit 0 = pass, non-zero + diff = fail.
- [ ] `MockChainProvider` (`CHAIN_PROVIDER=mock`) seeded with the SAME synthetic funding graph lets a tester run full filter logic with **zero external API keys**; `CHAIN_PROVIDER=dune` exercises the real path. README states which mode proves what (`ROLE3-ORACLE-SPEC.md:266-272`).
- [ ] `.github/workflows/acceptance.yml` runs the harness in CI (mock mode, no secrets).
- [ ] README states the mechanism-not-economy disclaimer in the first paragraph (`ROLE3-ORACLE-SPEC.md:274-282`).
**Dependencies:** FR-3, FR-4, FR-5.

### FR-7: Document the proof-schema seam for the rail owner (§8.7 / §1)
**Priority:** Must Have
**Description:** `docs/PROOF-SCHEMA.md` specifies the stable interface contract — the x402 payment proof `{ tx_hash, chain_id, from, amount, nonce }` — that the rail owner's future facilitator *produces* and the oracle *consumes* (`ROLE3-ORACLE-SPEC.md:42-44, 286`).
**Acceptance Criteria:**
- [ ] Proof schema documented field-by-field as the interface contract.
- [ ] Includes the **relayer-masking constraint**: the canonical rail MUST expose the real client-signed payer address, or the anti-sybil layer is defeated — "the single most important constraint to hand the rail owner" (`ROLE3-ORACLE-SPEC.md:306-311`).
- [ ] States the fee model is DEFERRED / out of Role-3 scope; the oracle stays fee-free in all phases (`ROLE3-ORACLE-SPEC.md:46-51, 181-192`).
**Dependencies:** none hard (can be drafted in parallel; finalized after FR-3 fixes the proof shape).

---

## Non-Functional Requirements

### Provenance & Honesty (project-defining)
- Every counted `tx_hash` MUST be independently verifiable on the Bepolia explorer (`ROLE3-ORACLE-SPEC.md:261`).
- No unverified technical fact stated as sourced; UNVERIFIED items (HONEY token standard) carried forward as confirm-against-source tasks (`ROLE3-ORACLE-SPEC.md:134-136, 292-297`).
- Anti-self-grading enforced: 0xhoneyjar held to its own filter (`ROLE3-ORACLE-SPEC.md:164-167`).

### Reproducibility / Determinism
- `verify` is deterministic: same inputs → same scores (Assertion D, `ROLE3-ORACLE-SPEC.md:262`).
- One-command boot on a stranger's machine with no 0xhoneyjar secrets (`ROLE3-ORACLE-SPEC.md:239-246`).

### Security / Trust boundaries
- On-chain `from` is the trust anchor for anti-sybil; self-broadcast preserves it (`ROLE3-ORACLE-SPEC.md:128-132, 306-311`).
- Tester key is a throwaway faucet wallet — never a 0xhoneyjar secret.
- No fee/treasury/PoL code paths (read-only).

### Licensing / Compliance
- AGPL-3.0; DCO sign-off; NOTICE attribution to loa-freeside; preserve copied-file headers (`ROLE3-ORACLE-SPEC.md:57-68`).

---

## Technical Considerations

### Architecture Notes
Off-chain measurement layer only (`ROLE3-ORACLE-SPEC.md:37-44`). Stack inherits loa-freeside: TypeScript, Express routes, Postgres, Redis, Drizzle migrations, `IChainProvider` port with Dune-Sim / hybrid adapters. Detailed design in `grimoires/loa/sdd.md`.

### Integrations

| System | Type | Purpose |
|--------|------|---------|
| Bepolia (chain_id 80069) | JSON-RPC + explorer | Read self-broadcast HONEY transfers; verify `tx_hash` |
| Dune Sim | HTTP API (optional) | `getActivity` / `getBalanceWithUSD` funding-graph data for §5 filters |
| Postgres / Redis | Docker services | Settlement store + nonce/replay dedup |

### Open / UNVERIFIED items (carried forward — DO NOT guess)
- **UNVERIFIED — HONEY token standard / Bepolia contract.** Only "Honey and USDC have the functionality required for x402" is sourced; no EIP named. Confirm before any transfer-with-authorization flow (`ROLE3-ORACLE-SPEC.md:134-136, 292-297`).
- **OPEN-1 — migration dependency chain + usage_events drift** (FR-2a above): source-verified, must be resolved during copy, not guessed.
- **Anti-sybil depends on Dune Sim.** `getActivity`/`getBalanceWithUSD` are optional/Dune-Sim-exclusive on `IChainProvider`; always-available methods are balance/ownership only. Hence the mock fallback (`ROLE3-ORACLE-SPEC.md:300-305`; verified at `../loa-freeside/packages/core/ports/chain-provider.ts:278`).

---

## Scope & Prioritization

### In Scope (PoC MVP)
- FR-1 … FR-7 above (the full §8 build order steps 1–7).

### Explicitly Out of Scope
- **PoL-Next emission gating (Role 1).** Wiring realness score → reward-vault emission is §8.8, a *later* Role-1 build, NOT this PoC (`ROLE3-ORACLE-SPEC.md:205, 211-216`).
- **On-chain fee / treasury / settlement rail (external on-chain layer).** The protocol fee and the canonical contract belong to the rail owner's later on-chain layer; the oracle is fee-free in all phases (`ROLE3-ORACLE-SPEC.md:11-16, 46-51, 181-192`).
- **Claiming a real Berachain agent economy.** The PoC asserts mechanism only (`ROLE3-ORACLE-SPEC.md:217-219`).
- **Managed facilitator / thirdweb / relayer settlement.** Avoided by design — would mask the payer (`ROLE3-ORACLE-SPEC.md:128-132, 306-311`).

### Priority Matrix

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| FR-3 Payer persistence | P0 | S | High (unblocks everything) |
| FR-2 / FR-2a Curated copy + migration resolution | P0 | M | High |
| FR-4 Bepolia/HONEY config | P0 | S | High |
| FR-5 Oracle ruleset + score | P0 | L | High |
| FR-6 Acceptance harness | P0 | L | High (the deliverable) |
| FR-1 Scaffolding | P1 | S | Medium |
| FR-7 Proof-schema doc | P1 | S | Medium (rail owner ask) |

---

## Success Criteria

### Launch (PoC acceptance) Criteria
- [ ] A clean-machine `docker compose up` → `pnpm seed:bepolia` → `pnpm verify` exits 0 with no 0xhoneyjar secrets.
- [ ] Assertions A–D all pass (farm excluded, clean survives, tx_hashes resolve, deterministic).
- [ ] CI acceptance workflow is green in mock mode.
- [ ] README leads with the mechanism-not-economy disclaimer.
- [ ] `docs/PROOF-SCHEMA.md` + relayer-masking constraint delivered for the rail owner.
- [ ] No fee/treasury/PoL code anywhere in the repo.

### Non-goals confirmed
- [ ] No PoL-Next wiring present.
- [ ] No claim of live Berachain agent revenue in any artifact.

---

## Risks & Mitigation

| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Relayer/payer masking defeats anti-sybil (thesis-level) | Med | High | PoC self-broadcasts (`from`==payer); hand the rail owner the relayer-masking constraint in PROOF-SCHEMA.md (`ROLE3-ORACLE-SPEC.md:306-311`) |
| HONEY token interface assumed wrong | Med | Med | Carry UNVERIFIED forward; self-broadcast model avoids dependence; confirm against Bepolia contract before any auth-transfer flow |
| Copied migrations fail on clean DB (missing functions/roles) + usage_events drift | High | High | FR-2a: resolve dependency chain + schema reconciliation during copy; gate on green `compose up` (verified `0009/0010/0011` depend on `0001–0008`) |
| Tester blocked by missing Dune Sim key | Med | High | `MockChainProvider` (`CHAIN_PROVIDER=mock`) runs full filter logic with zero keys (`ROLE3-ORACLE-SPEC.md:266-272`) |
| Mechanism mistaken for economy claim | Med | High | Disclaimer in README first paragraph + §10.6 tester framing (`ROLE3-ORACLE-SPEC.md:274-282`) |
| Role 3 prematurely welded to Role 1 | Low | High | Sequencing discipline §9; PoL-free, read-only PoC (`ROLE3-ORACLE-SPEC.md:211-216`) |

### Assumptions
- `../loa-freeside` remains the read-only AGPL source; this run does NOT copy from it (planning only).
- Bepolia faucet + public RPC remain available to external testers.

---

## Appendix

### A. Source Provenance (audited claims, file:line)

| Claim | Source |
|-------|--------|
| Payer `from` discarded (`payload='{}'`) | `../loa-freeside/packages/services/x402-settlement.ts:155-156` |
| `usage_events` has no payer column | `../loa-freeside/packages/services/x402-settlement.ts:229-232` |
| `from` parsed+validated, not persisted | `../loa-freeside/packages/routes/x402.routes.ts:183,190` |
| Hardcoded base/USDC/8453 | `../loa-freeside/packages/routes/x402.routes.ts:76,111-113,168-170` |
| Bepolia 80069 absent from CHAIN_CONFIGS | `../loa-freeside/packages/core/ports/chain-provider.ts:398-459` |
| `getActivity` Dune-Sim-exclusive/optional | `../loa-freeside/packages/core/ports/chain-provider.ts:278,345` |
| Migrations depend on 0001–0008 helpers/roles | `../loa-freeside/themes/sietch/drizzle/migrations/0009,0010,0011` |

### B. Glossary

| Term | Definition |
|------|------------|
| Raw Revenue | Σ `actual_micro` over window (everything) |
| Qualified Revenue | Σ `actual_micro` over settlements passing the §5 anti-farming filter |
| Realness score | Qualified / Raw ∈ [0,1] |
| The seam | x402 payment proof `{ tx_hash, chain_id, from, amount, nonce }` — interface between rail owner facilitator and oracle |
| Self-broadcast | Payer broadcasts its own HONEY transfer; on-chain `from` == real payer |
| Affiliated revenue | Settlements from 0xhoneyjar/operator/team wallets — flagged + excluded from headline |

### C. Open Questions (for the rail owner / maintainer)

| ID | Question | Status |
|----|----------|--------|
| OPEN-1 | How to reconcile copied migrations' dependency on 0001–0008 helpers/roles + `usage_events` source/reference_id drift? | Open (FR-2a) |
| OPEN-2 | HONEY's exact token standard + Bepolia contract address? | Open / UNVERIFIED |
| OPEN-3 | Affiliate allowlist seed — which 0xhoneyjar/operator/team wallets? | Open (needed for FR-5 step 1) |
| OPEN-4 | Dust-floor threshold value (micro-USD)? | Open (FR-5 step 2) |

---

*Generated by PRD Architect Agent — Loa `/plan`. Restates `ROLE3-ORACLE-SPEC.md`; spec is authoritative.*
