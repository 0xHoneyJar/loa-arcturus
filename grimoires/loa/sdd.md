# Software Design Document: loa-arcturus — Proof-of-Revenue Oracle (Role 3 PoC)

**Version:** 1.0
**Date:** 2026-06-10
**Author:** Architecture Designer Agent (Loa `/plan`)
**Status:** Draft
**PRD Reference:** `grimoires/loa/prd.md`
**Spec (authoritative):** `ROLE3-ORACLE-SPEC.md`

> **Scope guard:** This SDD designs a **read-only measurement layer on Bepolia (80069)**. No on-chain fee/treasury logic, no PoL-Next wiring. The deliverable is "the meter works." (`ROLE3-ORACLE-SPEC.md:11-16, 211-219`)

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [Software Stack](#2-software-stack)
3. [Database Design](#3-database-design)
4. [The Oracle — Ruleset & Realness Score](#4-the-oracle--ruleset--realness-score)
5. [API & Module Specifications](#5-api--module-specifications)
6. [The Seam — Proof Schema (rail interface)](#6-the-seam--proof-schema-rail-interface)
7. [Acceptance Harness (external reproducibility)](#7-acceptance-harness-external-reproducibility)
8. [Development Phases (maps to §8 build order)](#8-development-phases-maps-to-8-build-order)
9. [Known Risks and Mitigation](#9-known-risks-and-mitigation)
10. [Open Questions](#10-open-questions)
11. [Appendix](#11-appendix)

---

## 1. Project Architecture

### 1.1 System Overview

loa-arcturus consumes x402 payment proofs, persists the payer, profiles the payer wallet on-chain, applies an anti-farming filter, and publishes Raw vs Qualified Revenue with a realness score per service. It is the off-chain half of a two-layer system whose other half (the on-chain settlement rail) is owned by the external on-chain rail owner and is **out of PoC scope**.

> Layer split (`ROLE3-ORACLE-SPEC.md:37-44`):
>
> | Layer | Owner | Contents |
> |---|---|---|
> | Off-chain measurement (**this repo**) | 0xhoneyjar (AGPL) | quote/settle, credit lots, **payer persistence**, oracle, ruleset, realness score |
> | On-chain settlement rail (later) | external on-chain rail owner | x402 facilitator, native HONEY settlement, **protocol fee — NOT in Role-3 PoC** |

### 1.2 Architectural Pattern

**Pattern:** Modular monolith (Express service) over Postgres + Redis, with a ports-and-adapters boundary at the chain layer (`IChainProvider`). Justification: this is the shape inherited from loa-freeside (curated copy, AGPL→AGPL); re-architecting would violate the "curated copy, NOT full fork" directive and the Karpathy surgical-changes principle. The PoC adds modules, it does not redesign the substrate.

### 1.3 Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         loa-arcturus (off-chain)                       │
│                                                                        │
│  payer wallet ──self-broadcast HONEY tx──▶ Bepolia (80069)             │
│       │                                          ▲                     │
│       │ hands tx_hash                            │ READ (confirm)      │
│       ▼                                          │                     │
│  ┌─────────────┐   proof    ┌──────────────┐     │                     │
│  │ x402.routes │──────────▶ │ x402-settle  │─────┘                     │
│  └─────────────┘            │  (settle())  │                           │
│                             └──────┬───────┘                           │
│                  persists payer    │  writes                           │
│                       ▼            ▼                                    │
│              ┌──────────────────────────────┐                         │
│              │ Postgres: x402_settlements    │  + usage_events,        │
│              │  (payer_address, tx_hash, …)  │    credit_lots, …       │
│              └───────────────┬──────────────┘                         │
│                              │ reads                                   │
│                              ▼                                         │
│                      ┌───────────────┐    profiles    ┌─────────────┐  │
│                      │ Oracle module │───────────────▶│IChainProvider│ │
│                      │ ruleset+score │                │ dune | mock  │  │
│                      └───────┬───────┘                └─────────────┘  │
│                              │ publishes                               │
│                              ▼                                         │
│              Raw | Qualified | realness score   (verify CLI / API)     │
└──────────────────────────────────────────────────────────────────────┘
        seam = proof { tx_hash, chain_id, from, amount, nonce }  ──▶ rail owner facilitator (later)
```

### 1.4 System Components

#### x402 routes (`x402.routes.ts` — copied)
- **Purpose:** quote + settle HTTP surface.
- **Change required (FR-4):** replace hardcoded `chain:'base'`/`token:'USDC'`/`chainId=8453` with config-driven chain/token (`../loa-freeside/packages/routes/x402.routes.ts:76,111-113,168-170`).

#### x402 settlement (`x402-settlement.ts` — copied)
- **Purpose:** quote-settle pattern, nonce dedup, usage/credit recording.
- **Change required (FR-1/G-1):** persist `proof.from`. Today `verifyNonceUnique()` writes `payload='{}'` (`x402-settlement.ts:155-156`) and `settle()` writes `usage_events` without a payer (`x402-settlement.ts:229-232`). Add the `x402_settlements` write inside `settle()`.

#### Oracle module (NET-NEW — FR-5)
- **Purpose:** read `x402_settlements`, profile payers via `IChainProvider`, apply the §5 filter stack, emit `{raw, qualified, score}`.
- **Dependencies:** `x402_settlements`, `IChainProvider.getActivity`/`getBalanceWithUSD` (Dune-Sim-exclusive — `chain-provider.ts:278`).

#### Chain provider (`IChainProvider` + adapters — copied)
- **Purpose:** on-chain reads. Tier-1 (balance/ownership) always available; Tier-2 / Dune-Sim-exclusive (`getActivity`, `getBalanceWithUSD`) optional.
- **Change required (FR-4):** add Bepolia 80069 `ChainConfig`.
- **NET-NEW:** `MockChainProvider` seeded with the synthetic funding graph (`CHAIN_PROVIDER=mock`).

#### Acceptance harness (NET-NEW — FR-6)
- `scripts/seed-bepolia.ts`, `scripts/verify.ts`, `docker-compose.yml`, `.env.example`, `.github/workflows/acceptance.yml`.

### 1.5 Data Flow

1. Payer self-broadcasts a HONEY transfer on Bepolia; on-chain `from` == payer (`ROLE3-ORACLE-SPEC.md:128-132`).
2. Payer hands the server the `tx_hash`; server READS Bepolia to confirm.
3. `settle()` persists `{payer_address, chain_id, tx_hash, nonce, quoted_micro, actual_micro}` into `x402_settlements` and records `usage_events` (Raw).
4. Oracle reads settlements, profiles payers, applies the filter stack, computes Qualified + score.
5. `verify` publishes the per-service table + Assertions A–D.

### 1.6 Security Architecture

- **Trust anchor:** the on-chain `from`. Self-broadcast keeps it equal to the real payer; a managed relayer would mask it and defeat anti-sybil (`ROLE3-ORACLE-SPEC.md:128-132, 306-311`).
- **No secrets required of the tester:** only their own throwaway funded key + a public RPC.
- **No fee/treasury/PoL code paths** anywhere (read-only PoC).
- **Untrusted on-chain inputs:** payer-supplied `tx_hash` is confirmed by chain read before counting; `UNIQUE(chain_id, tx_hash)` prevents replay/double-count.

---

## 2. Software Stack

> Inherited from loa-freeside via curated copy. Versions to be **pinned during FR-2 against the real `package.json`** — not invented here (provenance honesty).

### 2.1 Backend

| Category | Technology | Notes |
|----------|------------|-------|
| Language | TypeScript (Node) | matches loa-freeside source |
| HTTP | Express | `x402.routes.ts` is an Express `Router` (`../loa-freeside/packages/routes/x402.routes.ts:21`) |
| DB | PostgreSQL | micro-USD as BIGINT/NUMERIC; no floating point in the economic path |
| Cache / dedup | Redis (ioredis) | nonce/replay (`x402-settlement.ts:19`) |
| Migrations | Drizzle SQL migrations | source under `themes/sietch/drizzle/migrations/` |
| Chain reads | `IChainProvider` + Dune Sim / hybrid adapters | `dune-sim-client.ts`, `hybrid-provider.ts`, `provider-factory.ts` |
| Package manager | pnpm | harness uses `pnpm seed:bepolia` / `pnpm verify` (`ROLE3-ORACLE-SPEC.md:248,257`) |

**[CONFIRM-AGAINST-SOURCE]** Exact versions, lockfile strategy, and whether to keep Drizzle vs raw SQL are decided during FR-2 by reading the real loa-freeside manifests, not assumed here.

### 2.2 Infrastructure & DevOps

| Category | Technology | Purpose |
|----------|------------|---------|
| Containerization | Docker Compose | one-command boot: Postgres + Redis + oracle (`ROLE3-ORACLE-SPEC.md:240-241`) |
| CI | GitHub Actions | `.github/workflows/acceptance.yml`, mock mode, no secrets (`ROLE3-ORACLE-SPEC.md:263, 285`) |
| Chain | Bepolia testnet RPC + explorer | `https://bepolia.beratrail.io`; faucet `bepolia.faucet.berachain.com` |

---

## 3. Database Design

### 3.1 Primary Database
PostgreSQL. All monetary values micro-USD as integer/`NUMERIC(30,0)` — no floating point (matches loa-freeside ledger discipline, `0009_credit_lots_lot_entries.sql`).

### 3.2 The Gap — payer persistence (FR-3, blocks everything)

> **Verified gap** (`ROLE3-ORACLE-SPEC.md:74-80`): payer `from` is parsed (`x402.routes.ts:183`) but never persisted; `verifyNonceUnique()` discards it as `payload='{}'` (`x402-settlement.ts:155-156`); `usage_events` has no payer (`x402-settlement.ts:229-232`).

**Option A (minimal):** in `verifyNonceUnique()`, replace `payload '{}'` with the real proof JSONB (`ROLE3-ORACLE-SPEC.md:84-93`).

**Option B (queryable — RECOMMENDED for the oracle, `ROLE3-ORACLE-SPEC.md:94-112`):**

```sql
CREATE TABLE x402_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  payer_address TEXT NOT NULL,          -- the missing piece: proof.from
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  quoted_micro NUMERIC(30,0) NOT NULL,
  actual_micro NUMERIC(30,0) NOT NULL,  -- real settled revenue
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, tx_hash)
);
CREATE INDEX idx_x402_settlements_payer ON x402_settlements(payer_address);
CREATE INDEX idx_x402_settlements_agent ON x402_settlements(agent_id, settled_at);
```

Populated inside `settle()` alongside the existing `usage_events` insert. **Design decision: adopt Option B** — the oracle needs to query by `payer_address` and `(agent_id, window)`; the JSONB-only Option A would force JSON extraction on every oracle read.

### 3.3 Copied tables (FR-2) and their dependency chain — OPEN-1

The migrations the spec lists for copy — `webhook_events` + `crypto_payments` (`0010`), credit-lot tables (`0009`) — plus the load-bearing **`usage_events` (`0011`, NOT in the §2 list but required for Raw Revenue)** — **do not stand alone on a clean database.** Verified:

- `0009/0010/0011` reference `prevent_mutation()`, `app.current_community_id()`, and roles `arrakis_app` / `arrakis_admin`, which are defined in **earlier** migrations `0001_rls_policies.sql … 0008_tenant_context_guard.sql` (`grep` over `../loa-freeside/themes/sietch/drizzle/migrations/`).
- **`usage_events` code↔schema drift:** `settle()` inserts `usage_events(community_id, amount_micro, source, reference_id, created_at)` (`x402-settlement.ts:229-232`), but `0011_usage_events_pg.sql` defines **no `source`/`reference_id` columns** and requires `nft_id`/`pool_id` NOT NULL. As-copied, that insert fails.

**Design decision (to be finalized in FR-2a, documented, not guessed):** the PoC is single-tenant and read-only, so the RLS/tenant machinery (`app.current_community_id()`, per-tenant policies) is **not needed for the meter**. Two candidate resolutions, decided against source during implementation:
1. **Strip-down:** author PoC-local migrations that define only the columns the oracle + `settle()` actually touch (drop RLS policies, `prevent_mutation` triggers, tenant roles), and reconcile `usage_events` to the shape `settle()` writes.
2. **Port-prerequisites:** copy `0001–0008` DDL verbatim so the copied migrations apply unchanged.

Strip-down is preferred (simplicity-first; the tenant isolation is loa-freeside product surface, not meter mechanism), **but the choice and the exact `usage_events` reconciliation MUST be recorded in `docs/` with provenance** — no silent schema invention. This is the single largest hidden-effort item in the copy step.

### 3.4 Data Access Patterns

| Query | Frequency | Optimization |
|-------|-----------|--------------|
| Oracle: settlements per `agent_id` over window | per verify | `idx_x402_settlements_agent (agent_id, settled_at)` |
| Filter: lookups by `payer_address` | per settlement | `idx_x402_settlements_payer` |
| Replay guard | per settle | `UNIQUE(chain_id, tx_hash)` |

---

## 4. The Oracle — Ruleset & Realness Score

> Source: `ROLE3-ORACLE-SPEC.md:140-167`. This is **net-new code** (FR-5). Cycle-detection + funding-graph analysis is built on top of `getActivity`, not provided by the port (`ROLE3-ORACLE-SPEC.md:301-305`).

### 4.1 Inputs
- `x402_settlements` (revenue + payer).
- `IChainProvider` payer profile on Berachain 80094 / Bepolia 80069 (`getActivity`, `getBalanceWithUSD` — Dune-Sim-exclusive, `chain-provider.ts:278,295,345`).

### 4.2 Definitions
- **Raw Revenue** = Σ `actual_micro` over window.
- **Qualified Revenue** = Σ `actual_micro` over settlements that PASS the filter stack.
- **Realness score** = Qualified / Raw ∈ [0,1].

### 4.3 Filter stack (applied per settlement)

| # | Filter | Effect | Input needed |
|---|--------|--------|--------------|
| 1 | **Affiliate exclusion** | drop if `payer_address` ∈ 0xhoneyjar/operator/team allowlist (FLAGGED, not counted) | maintained allowlist (OPEN-3) |
| 2 | **Dust floor** | drop below micro threshold (anti-spam wash) | threshold value (OPEN-4) |
| 3 | **Circular-flow detection** | drop where payer funded by / routes back to recipient service wallet | `getActivity` funding graph + cycle detection (net-new) |
| 4 | **Wallet-age / funding-history weighting** | down-weight fresh / affiliate-funded; up-weight aged / independently funded | `getActivity` history |
| 5 | **External-origin bonus** | up-weight CEX / bridge / unrelated-DeFi funding | `getActivity` source classification |

> **Design note on filters 4–5 vs the score formula.** The spec defines score as `Qualified/Raw ∈ [0,1]` (a sum of *passing* `actual_micro`), but filters 4–5 are described as **weighting**, not binary pass/drop. The PoC must reconcile this: either (a) treat 1–3 as binary gates feeding the Σ and surface 4–5 as separate diagnostic weights, or (b) define Qualified as a weighted sum and document the weighting function. **Decision deferred to FR-5 with explicit documentation** — the headline must remain reproducible and the methodology open (`ROLE3-ORACLE-SPEC.md:161-163, 256-262`). Recorded as OPEN-5.

### 4.4 Headline metric & anti-self-grading
- Headline = **services whose Qualified Revenue would survive with zero subsidy / zero emissions** (`ROLE3-ORACLE-SPEC.md:161-162`).
- Publish Raw + Qualified + score side by side; methodology open & reproducible.
- **Anti-self-grading (credibility-critical):** index ALL services, hold 0xhoneyjar's own to the same filter, visibly label + exclude affiliated revenue from the headline; be willing to report 0xhoneyjar's own real revenue ≈ \$0 (`ROLE3-ORACLE-SPEC.md:164-167`).

---

## 5. API & Module Specifications

> The PoC's primary "API" is the CLI verdict surface (`verify`); an HTTP read API is optional and not required for acceptance. Design the oracle as a library module callable by both `verify.ts` and any future endpoint.

### 5.1 Oracle module (library)

```
computeServiceRevenue(agentId, window, deps): {
  agent_id: string;
  raw_micro: bigint;
  qualified_micro: bigint;
  score: number;            // qualified/raw ∈ [0,1]
  flagged_affiliated_micro: bigint;
  methodology: { filters_applied, thresholds, provider_mode };  // open & reproducible
}
```
`deps = { settlementsRepo, chainProvider, affiliateAllowlist, dustFloorMicro }`.

### 5.2 Settlement write (modified `settle()`)
Inside the existing `withCommunityScope` transaction (`x402-settlement.ts:205`), after the `usage_events` insert, insert into `x402_settlements` with the proof fields. `X402PaymentProof` already carries everything needed: `tx_hash, chain_id, from, amount_micro, nonce, agent_id, community_id` (`x402-settlement.ts:42-58`) — the data is present in memory; only persistence is missing.

### 5.3 Chain config (modified `CHAIN_CONFIGS`)
Add (FR-4):
```
bepolia: { chainId: 80069, name: 'Bepolia', symbol: 'BERA'|?,
           rpcUrls: [<public Bepolia RPC>], explorerUrl: 'https://bepolia.beratrail.io',
           decimals: 18, isTestnet: true }
```
**[CONFIRM-AGAINST-SOURCE]** native symbol/decimals and the canonical public RPC list pulled from Berachain docs during FR-4, not assumed.

### 5.4 Error handling
Inherit loa-freeside conventions. New surfaces:
- Unconfirmed `tx_hash` (chain read fails) → reject settlement, do not count.
- `getActivity` unavailable (no Dune key) → oracle runs against `MockChainProvider`; README states mock proves *filter logic*, dune proves *real data* (`ROLE3-ORACLE-SPEC.md:266-272`).

---

## 6. The Seam — Proof Schema (rail interface)

> FR-7. Output: `docs/PROOF-SCHEMA.md` (`ROLE3-ORACLE-SPEC.md:42-44, 286`).

**Proof = `{ tx_hash, chain_id, from, amount, nonce }`.** The rail owner's facilitator *produces* proofs; the oracle *consumes* them. Document field-by-field as the stable interface contract.

**Mandatory constraint to hand the rail owner** (`ROLE3-ORACLE-SPEC.md:306-311`): the canonical rail MUST expose the **real client-signed payer address** in the proof. If settlement broadcasts via a managed server wallet, on-chain `from` becomes the relayer and payer-profiling is worthless — "the single most important constraint to hand the rail owner."

**Fee model statement (DEFERRED):** the oracle is fee-free and contains no treasury/fee logic; the protocol fee belongs in the later on-chain layer, and its target is out of scope for this PoC (`ROLE3-ORACLE-SPEC.md:46-51, 181-192`).

---

## 7. Acceptance Harness (external reproducibility)

> FR-6. Source: `ROLE3-ORACLE-SPEC.md:223-287`. Design principle: **the tester verifies the meter is real without trusting the author.**

### 7.1 One-command boot (§10.2)
- `docker compose up` → Postgres + Redis + oracle. No 0xhoneyjar-hosted service, no 0xhoneyjar-only secret.
- `.env.example` documents every var. Tester supplies ONLY: Bepolia RPC URL, a faucet-funded throwaway key, optional Dune Sim key.
- Migrations auto-run on boot, including the §3 payer-persistence migration.

### 7.2 Reproducible seed (§10.3)
`pnpm seed:bepolia`, triggered by the tester:
- generates N payer wallets — clean/external-funded AND farm-like (fresh wallets, circular funding);
- self-broadcasts real HONEY transfers on Bepolia against 1–3 demo x402 services;
- prints every `tx_hash` for explorer verification;
- writes resulting proofs through the **real `settle()` path** (NOT direct table inserts).

### 7.3 Pass/fail (§10.4)
`pnpm verify` prints per-service Raw/Qualified/score + machine-checkable assertions:

| ID | Assertion |
|----|-----------|
| A | farm-like wallets' revenue excluded from Qualified (score drops as designed) |
| B | clean/external-funded wallets survive into Qualified |
| C | every counted `tx_hash` resolves on the Bepolia explorer |
| D | re-running `verify` is deterministic (same inputs → same scores) |

Exit 0 = all pass; non-zero + diff = fail. CI runs the same harness (mock mode) so the tester sees green before cloning.

### 7.4 No-secret fallback (§10.5)
`MockChainProvider` seeded with the SAME synthetic funding graph the seed script created, selected via `CHAIN_PROVIDER=mock`. Full filter logic runs with zero external keys; `CHAIN_PROVIDER=dune` exercises the real path. README is explicit: **mock = filter logic; dune = real data.**

### 7.5 Testability artifacts (§10.7)
`README.md` (5-min quickstart, mechanism-not-economy disclaimer up top), `docker-compose.yml` + `.env.example` + auto-migrations, `scripts/seed-bepolia.ts`, `scripts/verify.ts`, `.github/workflows/acceptance.yml`, `docs/PROOF-SCHEMA.md`.

---

## 8. Development Phases (maps to §8 build order)

> Canonical sequence: `ROLE3-ORACLE-SPEC.md:196-205`. Detailed sprintization in `grimoires/loa/sprint.md`.

| Build step | SDD section | FR | Sprint |
|---|---|---|---|
| 1. AGPL repo, DCO, LICENSE, NOTICE | §1, §6 | FR-1 | Sprint 1 |
| 2. Curated copy of ~6 files + migrations | §1.4, §3.3 | FR-2 / FR-2a | Sprint 1 |
| 3. **Payer-persistence migration (blocks all)** | §3.2 | FR-3 | Sprint 2 |
| 4. Berachain/HONEY config + Bepolia 80069 | §5.3 | FR-4 | Sprint 2 |
| 5. Oracle ruleset + realness score | §4 | FR-5 | Sprint 3 |
| 6. Real self-broadcast seed + acceptance harness | §7 | FR-6 | Sprint 4 |
| 7. Document proof-schema seam | §6 | FR-7 | Sprint 4 (parallel-drafted) |
| 8. (Later, Role 1) realness → PoL gating | — | OUT OF SCOPE | — |

---

## 9. Known Risks and Mitigation

| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Relayer/payer masking defeats anti-sybil | Med | High | Self-broadcast (`from`==payer); hand rail owner the constraint in PROOF-SCHEMA.md (`ROLE3-ORACLE-SPEC.md:306-311`) |
| Copied migrations fail on clean DB + usage_events drift (OPEN-1) | High | High | FR-2a strip-down vs port-prereqs decision, gated on green `compose up`; documented |
| HONEY token interface assumed wrong (UNVERIFIED) | Med | Med | Self-broadcast avoids dependence; confirm contract before any auth-transfer flow (`ROLE3-ORACLE-SPEC.md:134-136,292-297`) |
| Filters 4–5 weighting vs binary score ambiguity (OPEN-5) | Med | Med | FR-5 reconciles + documents; headline stays reproducible |
| Tester blocked without Dune key | Med | High | `MockChainProvider` runs full filter logic with zero keys |
| Mechanism mistaken for economy | Med | High | README first-paragraph disclaimer + §10.6 framing |
| Premature Role-3→Role-1 weld | Low | High | Read-only, PoL-free PoC; sequencing discipline §9 |

---

## 10. Open Questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| OPEN-1 | Reconcile copied-migration dependency chain (0001–0008 helpers/roles) + `usage_events` source/reference_id drift | maintainer | Open (FR-2a) |
| OPEN-2 | HONEY exact token standard + Bepolia contract address (UNVERIFIED) | rail owner / maintainer | Open |
| OPEN-3 | Affiliate allowlist seed (0xhoneyjar/operator/team wallets) | 0xhoneyjar | Open (FR-5.1) |
| OPEN-4 | Dust-floor threshold (micro-USD) | maintainer | Open (FR-5.2) |
| OPEN-5 | Filters 4–5: weighting function vs binary gate in the Qualified Σ | maintainer | Open (FR-5) |
| OPEN-6 | Bepolia native symbol/decimals + canonical public RPC list | maintainer | Open (FR-4) |

---

## 11. Appendix

### A. Source Provenance (file:line — audited against `../loa-freeside`)

| Fact | Source |
|------|--------|
| `verifyNonceUnique()` discards proof (`payload='{}'`) | `packages/services/x402-settlement.ts:155-156` |
| `settle()` writes usage_events without payer | `packages/services/x402-settlement.ts:229-232` |
| `X402PaymentProof` already carries from/chain_id/tx_hash/nonce | `packages/services/x402-settlement.ts:42-58` |
| `from` parsed + validated, never persisted | `packages/routes/x402.routes.ts:183,190` |
| Hardcoded chain:'base'/token:'USDC'/chainId=8453 | `packages/routes/x402.routes.ts:76,111-113,168-170` |
| `CHAIN_CONFIGS` lacks Bepolia 80069 (has 80094/1/137/42161/8453) | `packages/core/ports/chain-provider.ts:398-459` |
| `getActivity`/`getBalanceWithUSD` Dune-Sim-exclusive/optional | `packages/core/ports/chain-provider.ts:278,295,345` |
| Copied migrations depend on 0001–0008 helpers/roles | `themes/sietch/drizzle/migrations/0009,0010,0011` |
| `usage_events` PG schema lacks source/reference_id | `themes/sietch/drizzle/migrations/0011_usage_events_pg.sql` |

### B. Change Log
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-10 | Initial SDD from spec + source audit | Architecture Designer (Loa `/plan`) |

---

*Generated by Architecture Designer Agent — Loa `/plan`. Spec `ROLE3-ORACLE-SPEC.md` is authoritative.*
