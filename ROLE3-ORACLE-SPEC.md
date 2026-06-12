# loa-arcturus — Proof-of-Revenue Oracle (Role 3) — Technical Spec (PoC)

**Project:** loa-arcturus (Loa stack; Arcturus = guardian of Berachain — the one repo that
bridges Sprawl-canon naming and Berachain lore)
**Owner:** 0xhoneyjar
**On-chain settlement rail (later, out of scope):** external Berachain x402 facilitator layer — downstream, no PoC dependency
**License:** AGPL-3.0 (open source)
**Status:** Spec — pre-build
**Date:** 2026-06-10

> **PoC scope note (Role 3):** This PoC is a **read-only measurement layer on Bepolia**. It
> collects NO fees and contains NO on-chain fee/treasury logic. A protocol fee lives in the
> later on-chain settlement rail, which is out of scope for this PoC. Keeping the oracle
> fee-free preserves its arms-length "neutral referee" credibility.

---

## 0. One-paragraph thesis

An open-source, anti-sybil **revenue-truth oracle** for the Berachain agent economy.
It ingests x402 payment settlements, profiles payer wallets, applies an anti-farming
filter, and publishes **Qualified Revenue** (real arms-length demand) vs **Raw Revenue**
(everything) per service, with a per-service **realness score** and open methodology.
This is the *honesty layer* no existing x402 dashboard provides — every competitor does
discovery/uptime, none does real-vs-farm. Built on Bepolia by 0xhoneyjar; designed to point
at Berachain mainnet once the rail owner ships the canonical x402 settlement rail.

**This PoC proves the meter works — NOT that an economy exists yet.** Present it as a
mechanism demo on seeded data, never as "Berachain has $X of real agent revenue."

---

## 1. Layer split & the seam

| Layer | Owner | Enforcement | Contents |
|---|---|---|---|
| Off-chain measurement | 0xhoneyjar | open code (AGPL) | quote/settle, credit lots, payer persistence, oracle, ruleset, realness score, leaderboard |
| On-chain settlement rail | external on-chain rail owner | on-chain (canonical contract) | Berachain x402 facilitator, native HONEY settlement, **protocol fee (later; fee target out of scope — NOT in Role-3 PoC)** |

**The seam = the x402 payment proof:** `{ tx_hash, chain_id, from, amount, nonce }`.
The rail owner's facilitator *produces* proofs; the oracle *consumes* them. Neither side
blocks the other's internal work. Document this schema as the stable interface contract.

**Fee model (DEFERRED — out of Role-3 PoC scope):** the Role-3 oracle is fee-free and contains
no treasury/fee logic. When the on-chain settlement rail is built (external on-chain layer, later), a
protocol fee will be enforced ON-CHAIN. The fee target is out of scope for this PoC. It is NOT
enforced in license terms (OSD #6 forbids it; AGPL would let a forker delete the fee line). The
moat is the canonical rail's liquidity + on-chain enforcement — not the license, and not the PoC.

---

## 2. Repo setup

- New repo in **0xhoneyjar org**, **AGPL-3.0**, **DCO** in CONTRIBUTING (consistent inbound
  terms; consider adding a CLA later if 0xhoneyjar wants relicensing flexibility).
- `LICENSE` (AGPL-3.0) + `NOTICE` crediting derivation from loa-freeside.
- **Curated copy, NOT full fork.** Derivation is AGPL→AGPL so direct copy is legal; preserve
  file headers. Bring over only:
  - `packages/services/x402-settlement.ts`
  - `packages/routes/x402.routes.ts`
  - `packages/services/credit-lot-service.ts`
  - `packages/adapters/storage/lot-entry-repository.ts`
  - chain-provider adapter (`dune-sim-client.ts` / `hybrid-provider.ts` / `provider-factory.ts`)
  - migrations: `webhook_events` + `crypto_payments` + credit-lot tables
  - `packages/core/ports/chain-provider.ts` (IChainProvider interface)
- **Leave behind:** agent gateway, ensemble accounting, Discord/themes/sietch, NOWPayments
  payout machinery, constructs, the 60 KB `.loa.config.yaml`.

---

## 3. THE GAP — payer-persistence migration (first commit after copy)

**Problem found in loa-freeside:** the payer address `from` is parsed and validated in
`x402.routes.ts` but **never durably persisted.** `verifyNonceUnique()` writes
`webhook_events.payload = '{}'` (proof discarded). `usage_events` stores
`community_id, amount_micro, source, reference_id=tx_hash` — no payer. So Raw Revenue is
computable today, but **Qualified Revenue is impossible** without the payer wallet.

**Fix (mandatory, blocks everything downstream):**

Option A (preferred — minimal): write the full proof into the JSONB that already exists.
```
-- in verifyNonceUnique(), replace payload '{}' with the proof:
INSERT INTO webhook_events (provider, event_id, event_type, payload, processed_at)
VALUES ('x402', $1, 'payment_proof',
        jsonb_build_object('from',$2,'chain_id',$3,'tx_hash',$4,'amount_micro',$5),
        NOW())
ON CONFLICT (provider, event_id) DO NOTHING
RETURNING id;
```
Option B (queryable — recommended for the oracle): new durable table.
```
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
Populate it inside `settle()` alongside the existing `usage_events` insert.

---

## 4. Berachain / HONEY config (issue #98)

In `x402.routes.ts` the facilitator block hardcodes Base (verified at lines 111-113 / 168-170:
`chain: 'base'`, `token: 'USDC'`; default `chainId = 8453` at line 76). Replace with config-driven:
- Bepolia testnet: `chain_id: 80069`, `token: 'HONEY'` (also accept USDC)
- Berachain mainnet: `chain_id: 80094`

**Scope reality (verified against source):**
- `CHAIN_CONFIGS` in `packages/core/ports/chain-provider.ts` (lines 398-459) ships berachain
  mainnet (80094), ethereum, polygon, arbitrum, base — but **NOT Bepolia 80069.** Bepolia must be
  ADDED as a new `ChainConfig` (RPC URLs + explorer `https://bepolia.beratrail.io`) before the
  oracle can read it.
- **Settlement model for the PoC = direct self-broadcast (NO managed facilitator, NO thirdweb).**
  The payer wallet broadcasts its own HONEY transfer on Bepolia and hands the server the
  `tx_hash`; the server READS the chain to confirm. This keeps the on-chain `from` = the real
  payer, which the anti-sybil layer depends on. (Contrast: a managed-relayer model would make
  `from` the relayer — see Risk section §10.)
- **HONEY token standard is UNVERIFIED.** The Berachain x402 tutorial states only that "Honey and
  USDC have the functionality required for x402" via an off-chain signed authorization; it does
  NOT name a specific EIP. Confirm HONEY's Bepolia contract (address TBD — pull from the Berachain
  docs/faucet) and its supported methods before assuming any transfer-with-authorization flow.

---

## 5. The oracle — Qualified Revenue ruleset & realness score

Reads `x402_settlements` (revenue + payer) and the chain-provider (payer on-chain profile,
Berachain 80094 / Bepolia 80069). For each service (agent_id):

**Raw Revenue** = Σ `actual_micro` over window.

**Qualified Revenue** = Σ `actual_micro` over settlements that PASS the filter stack:

1. **Affiliate exclusion** — drop settlements whose `payer_address` is a known
   0xhoneyjar / service-operator / team wallet (maintained allowlist; affiliated revenue
   is FLAGGED, not counted — the opposite of a marketing dashboard).
2. **Dust floor** — drop settlements below a micro threshold (anti-spam wash).
3. **Circular-flow detection** — drop where payer is funded by, or routes back to, the
   recipient service wallet (cycle detection on funding graph via chain provider).
4. **Wallet-age / funding-history weighting** — down-weight payers whose wallet is newly
   created or funded only by the service/affiliates; up-weight aged, independently-funded.
5. **External-origin bonus** — up-weight payers funded from CEX / bridge / unrelated DeFi
   (signals genuine outside demand, not a farm loop).

**Realness score** per service = `Qualified Revenue / Raw Revenue` ∈ [0,1].
Headline PoC metric: **services whose Qualified Revenue would survive with zero subsidy /
zero emissions.** Publish Raw + Qualified + score side by side, methodology open & reproducible.

**Anti-self-grading rule (credibility-critical):** the oracle indexes ALL services, holds
0xhoneyjar's own services to the same filter, and visibly labels + excludes affiliated
revenue from the headline. Be willing to report that 0xhoneyjar's own real revenue is ~$0 —
that honesty IS the product.

---

## 6. Bepolia demo — see §10 (external tester acceptance harness)

The PoC is demonstrated via **real self-broadcast Bepolia (80069) transactions** that an external
tester verifies independently — NOT synthetic DB fixtures. Full external-reproducibility design
(one-command boot, tester-run seed, objective pass/fail, explorer-verifiable tx_hashes, no-secret
mock fallback) is specified in **§10**. The principle: the tester confirms the meter is real
*without trusting the author*. Demo proves the *mechanism* (the meter), not the *economy*.

---

## 7. Two-phase delivery

The work comes in TWO phases:

**Now (Role-3 PoC):** no external dependency — the oracle runs fee-free on Bepolia with
0xhoneyjar-generated data. Show the working meter first.

**Later (settlement rail):** a canonical on-chain x402 settlement contract routes a protocol fee
on-chain. That rail and its fee target are out of scope for this PoC and belong to the external
on-chain layer. The oracle stays open and fee-free in all phases.

---

## 8. Build order

1. Create AGPL repo, DCO, LICENSE, NOTICE.
2. Curated copy of the ~6 files + migrations (headers intact).
3. **Payer-persistence migration** (§3) — blocks everything.
4. Berachain/HONEY config (§4).
5. Oracle module: ruleset + realness score (§5).
6. Real self-broadcast Bepolia seed + tester acceptance harness (§10).
7. Document the proof-schema seam (§1) for the rail owner.
8. (Later, Role 1) wire realness score → PoL-Next reward-vault emission gating.

---

## 9. Sequencing discipline

- **Roles 3 → 1, never welded.** Prove the oracle measures real-vs-farm BEFORE wiring it to
  real emissions. Wrong classification costs nothing while read-only; it costs real emissions
  once gating PoL.
- **PoC stays PoL-free.** PoL Next only enters at Role 1. Bepolia already runs the final
  PoL-Next model, so the eventual Role-1 build has zero migration debt — but don't reach for
  vaults during the measurement PoC.
- **Mechanism claim only.** Until the rail owner ships the mainnet rail and real usage exists,
  this is "the meter works," not "Berachain has a real agent economy." Conflating them rebuilds
  the aGDP dishonesty you set out to expose.

---

## 10. External-tester acceptance harness (external reproducibility)

**Goal shift:** when external engineers test this, the deliverable is no longer
"a demo 0xhoneyjar runs" — it is "a repo that boots on a stranger's machine, with no access to
0xhoneyjar secrets or local DB, and reports pass/fail they can verify WITHOUT trusting us."
Design every choice below around: *the tester verifies the meter is real without trusting the
author.*

### 10.1 Use REAL Bepolia transactions, not DB fixtures
For an external acceptance test, synthetic DB rows prove nothing — a skeptical engineer can't
distinguish a working oracle from a hardcoded fixture. The harness MUST seed from real on-chain
Bepolia (80069) transactions so the tester can independently confirm each `tx_hash` on the
Bepolia explorer. No managed facilitator / no thirdweb / no relayer in the PoC: payer wallets
**self-broadcast** their own HONEY transfers, so on-chain `from` == real payer (this also
sidesteps the relayer-masking risk in §11).

### 10.2 One-command boot, zero 0xhoneyjar dependencies
- `docker compose up` brings up Postgres + Redis + the oracle. No external managed DB, no
  0xhoneyjar-hosted service, no secret only 0xhoneyjar holds.
- `.env.example` documents every variable. The ONLY inputs a tester supplies:
  - a Bepolia RPC URL (public; external engineers already have these),
  - a funded test private key (their own throwaway wallet; faucet: bepolia.faucet.berachain.com),
  - (optional) a Dune Sim API key — see §10.5 for the no-key fallback.
- Migrations run automatically on boot (incl. the §3 payer-persistence migration).

### 10.3 Reproducible seed script the tester runs themselves
`pnpm seed:bepolia` (or `make seed`) executes a scripted scenario the TESTER triggers, so they
watch it happen rather than inheriting a pre-baked DB:
- generates N payer wallets (clean/external-funded + farm-like: fresh wallets, circular funding),
- self-broadcasts real HONEY transfers on Bepolia against 1–3 demo x402 services,
- prints every `tx_hash` so the tester can open each on the Bepolia explorer and confirm it's real,
- writes the resulting proofs through the real `settle()` path (NOT direct table inserts).

### 10.4 Pass/fail acceptance criteria (objective, on one screen)
`pnpm verify` prints a table the tester reads as a verdict, plus machine-checkable assertions:
- Per service: Raw Revenue, Qualified Revenue, realness score.
- **Assertion A:** farm-like wallets' revenue is excluded from Qualified (score drops as designed).
- **Assertion B:** clean/external-funded wallets survive into Qualified.
- **Assertion C:** every counted `tx_hash` resolves on the Bepolia explorer (real, not fabricated).
- **Assertion D:** re-running `verify` is deterministic (same inputs → same scores).
- Exit code 0 = all assertions pass; non-zero + diff = fail. A CI badge / GitHub Action runs
  the same harness so the tester sees green before they even clone.

### 10.5 No-secret fallback so a tester is never blocked
The §5 anti-sybil filters need transaction-graph data, exposed via the chain-provider's
`getActivity()` — which is **Dune-Sim-exclusive and optional** (see §11). To keep the harness
runnable without a Dune Sim key, ship a `MockChainProvider` seeded with the SAME synthetic
funding graph the seed script created, selected via `CHAIN_PROVIDER=mock`. The tester runs the
full filter logic with zero external API keys; swapping `CHAIN_PROVIDER=dune` exercises the real
path. Be explicit in the README which mode proves what (mock = filter logic; dune = real-data).

### 10.6 What the tester is asked to confirm (and what they are NOT)
- **They confirm:** the meter works — real Bepolia txs in, correct Raw/Qualified/realness out,
  farm wallets demonstrably filtered, results reproducible, tx_hashes independently verifiable.
- **They are NOT asked to confirm** any claim about real Berachain agent revenue — there is none
  yet; that's the §9 mechanism-vs-economy line. The README states this in the first paragraph so
  no engineer walks away thinking the PoC asserts a live economy.

### 10.7 Repo artifacts that make it testable
- `README.md` — 5-minute quickstart, the mechanism-not-economy disclaimer up top.
- `docker-compose.yml` + `.env.example` + auto-migrations.
- `scripts/seed-bepolia.ts` and `scripts/verify.ts` (the §10.3/§10.4 commands).
- `.github/workflows/acceptance.yml` — runs the harness in CI (mock mode, no secrets).
- `docs/PROOF-SCHEMA.md` — the §1 seam, so the rail owner's future facilitator targets it.

---

## 11. Corrections & open technical risks (audited against loa-freeside source)

- **HONEY token standard — UNVERIFIED.** An earlier draft claimed "HONEY supports EIP-3009 /
  EIP-2612." That is NOT sourced — repo grep finds zero references, and the Berachain tutorial
  only says "Honey and USDC have the functionality required for x402" via an off-chain signed
  authorization + server-wallet relay. **Confirm HONEY's actual token interface against its
  Bepolia contract before relying on any transfer-with-authorization flow.** For the PoC's
  self-broadcast model (§10.1) this doesn't matter — payers send normal transfers.
- **Bepolia (80069) is NOT in `CHAIN_CONFIGS`.** The chain-provider port ships berachain
  mainnet 80094, ethereum, polygon, arbitrum, base — Bepolia must be ADDED as a new
  `ChainConfig` (RPC URLs + explorer) before the oracle can read it. Small but required.
- **Anti-sybil profiling depends on Dune Sim.** The graph data the §5 filters need
  (`getActivity`, `getBalanceWithUSD`) is **optional / Dune-Sim-exclusive** on `IChainProvider`;
  always-available Tier-1 methods are balance/ownership only. Cycle-detection + funding-graph
  analysis is **net-new code** you build on top of `getActivity`, not something the port gives
  you for free. Hence the §10.5 mock fallback.
- **RISK — relayer/payer-identity masking (thesis-level).** If a settlement model broadcasts via
  a managed server wallet (the thirdweb tutorial pattern), the on-chain `from` is the RELAYER,
  not the payer, and payer-profiling becomes worthless. The PoC AVOIDS this by self-broadcasting
  (§10.1). But the rail owner's future canonical rail MUST expose the real client-signed payer
  address in the proof, or the entire anti-sybil layer is defeated. This is the single most
  important constraint to hand the rail owner alongside the §1 seam.
