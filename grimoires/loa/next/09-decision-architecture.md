# loa-arcturus — Decision Architecture: Verified Cash-Flow Credit for Metered Digital Businesses

**Status:** DECISION-GRADE RECOMMENDATION. Date: 2026-07-27.
**Author role:** principal protocol economist / adversarial systems architect.
**Supersedes the framing of** `01-blueprint.md` (Foundation-pays revenue-truth oracle) **and**
`07-reframe-permissionless-pol.md` (permissionless emissions faucet). Machinery from both survives;
both product identities are rejected below with evidence. `08-unix-swappability-and-serverless.md`
(contract discipline) survives intact and is incorporated by reference.

> **Scope discipline.** This document decides what loa-arcturus becomes, its first provable
> product, and what is deferred. It writes no code. Every major claim is pinned to a commit SHA +
> path or an official Berachain source with an as-of date.

---

## 0. Evidence Base

### 0.1 Repository pins (default branches, inspected 2026-07-27)

| Repo | SHA | Branch | One-line ground truth |
|---|---|---|---|
| 0xHoneyJar/loa-arcturus | `9313716` | main | Role-3 oracle PoC: deterministic filters real, **all chain data mocked**; no real tx ever scored |
| 0xHoneyJar/loa-hounfour | `e24752e2` | main | Contract registry v8.7.0: 234 schemas, constraint DSL w/ bigint conservation, cross-runner byte-identity |
| 0xHoneyJar/loa-finn | `69f3f8a7` | main | x402 verification module (3,337 LOC) real but **unmounted**; cost-atom metering live; Berachain RPC proven |
| 0xHoneyJar/loa-freeside | `8e616437` | main | Conservative-quote-settle + credit-lot ledger live; both x402 verifiers **uninjected**; no lending anywhere |
| 0xHoneyJar/loa-dixie | `d36c0846` | main | Reputation math (EMA/Bayesian/decay) + hash-chained audit trails; BFF in production |
| 0xHoneyJar/sonar-api | `b3209fd8` | main | Envio indexer, 6 EVM chains + Solana; **zero PoL-core coverage, no Bepolia** |
| 0xHoneyJar/score-api | `61773656` | main | Deterministic NFT-community conviction scoring; config-not-code onboarding; **no credit concepts** |
| 0xHoneyJar/identity-api | `bca4412c` | main | SIWE + ES256 svc-JWT/JWKS; operator_grants is 2-of-3 **manual allowlist**; no agent entity |
| 0xHoneyJar/billing-api | `7903cf9a` | main | Append-only double-entry lot ledger; **`overspend` primitive = honest bounded post-paid exposure**; no payment rails |
| 0xHoneyJar/ledger-api | `1a1a95e8` | main | Contract skeleton only; in-memory stub; "signed mutation" is prose, no signature verification in code |
| 0xHoneyJar/loa | `d75f5b60` | main | Dev framework v1.196.0; L1–L7 audit/trust primitives (bash, graduated-trust dormant) |

### 0.2 Official Berachain facts (fetched 2026-07-27)

- **PoL Next is live on mainnet.** BGT deprecated; per-block emission fixed: `baseRate` 0.4 WBERA
  (validator operator) + `rewardRate` 1.305 WBERA (Reward Vaults). Deployed ~24h before Fusaka
  (Fusaka mainnet 2026-06-24). Sources: docs changelog; docs PoL overview.
- **Allocation post-boost:** validators direct the 1.305 WBERA/block across **governance-whitelisted**
  vaults via BeraChef, weighted by stake-driven block production; Distributor applies any **DES**
  carve-out first. Incentives (net of ≤20% validator commission, default 5%) are auctioned for
  WBERA → accrue to **sWBERA** (7-day unbond). Governance moves to sWBERA.
- **Reward-vault whitelisting (RFRV):** creation permissionless; emissions require governance
  whitelist. Staking token: standard ERC-20, no special permissions, verified, <500k gas transfers,
  ≥1 audit; **≥$100k TVL** (DEX LP: ≥$50k paired with a Major); incentives **≥$10k/month for ≥2
  months**; weekly Wednesday 11:59 PM EST batch; periodic reevaluation + emergency veto.
- **DES:** `emissionPerc` bps carve-out (verified 500 bps as of 2026-07-17 — re-verify before
  relying); per-vault `targetEmission` cumulative cap = auto-sunset. `debt` is an **emission
  counter, not a loan** — the DES page contains **no repayment, revenue-share, KPI, or ERA
  language**. Roles: `DEFAULT_ADMIN_ROLE` (governance), `ALLOCATION_MANAGER_ROLE`.
- **ERA (Emissions Return Agreements):** forum-only (PoL Next post /t/1618): curated teams get
  emission streams and "return value" via fixed repayment, revenue share, and BERA/HONEY demand;
  example: $500k emissions over 12 months → repay $600k+ over following 6–12 months → ongoing
  revenue share. **Playbook unpublished; no docs page; no forum cohort thread; no on-chain
  enforcement mechanism exists.** The incentive marketplace continues "until enough high-quality
  ERA teams are onboarded, then it will be deprecated" (forum) — current docs still present the
  marketplace as active with no ERA mention.
- **HONEY:** fully-collateralized USD stablecoin (USDC/BYUSD/USDT0/USDe via HoneyFactory
  `0xA4aF…6401`); mint/redeem fees 0–0.1% partly to polFeeCollector → sWBERA yield; **EIP-3009 +
  EIP-2612 native** (docs confirm; verified on-chain 2026-07-17 at `0xFCBD…0Dce`); pausable proxy
  (admin risk, verified 2026-07-17).
- **Fusaka (mainnet 2026-06-24):** EIP-7951 **P-256 precompile** (passkey/secure-enclave signature
  verification — direct enabler for agent wallet custody), EIP-7702 native AA + gas sponsorship,
  in-payload deposits, 16.7M per-tx gas cap.

### 0.3 Market facts (2026-07-27)

| Fact | Value | Source |
|---|---|---|
| BERA price / market cap | **$0.1726 / $51.9M** | CoinGecko API |
| Berachain TVL | **$50.9M** | DefiLlama API |
| Block time (measured, 5,000 blocks to #24,074,778) | **2.00 s** | rpc.berachain.com |
| Reward-vault emissions | 20.58M WBERA/yr ≈ **$3.55M/yr** | computed (1.305 × 15.77M blocks) |
| Validator base emissions | 6.31M WBERA/yr ≈ $1.09M/yr | computed |
| DES carve at 500 bps | ~1.03M WBERA/yr ≈ **$178k/yr** | computed |
| HONEY circulating | **$11.38M** | DefiLlama stablecoins |
| Lending TVL: Dolomite / Bend | **$22.0M / $9.4M** (Bend = Morpho v1.1 fork) | DefiLlama; Clearstar RFRV |
| Other TVL: Concrete $44.1M · Kodiak $39M · Infrared $20.1M · Royco $16.1M | | DefiLlama |
| Canonical x402 `0x4020…` contracts on 80094 | **absent** (`eth_getCode = 0x`, re-verified today) | rpc.berachain.com |
| x402 ecosystem volume (wash-filtered, as of 2026-07-17) | ~$50k/day, ~93% on Base, **~$0 on Berachain** | prior research snapshot |

**First-order consequence:** at current prices the *entire* PoL vault emission budget is ~$3.55M/yr.
One forum-example ERA ($500k/yr) would consume ~14% of it. PoL Next capital is **small, curated,
and governance-mediated** — it can subsidize participation; it cannot be a credit engine, a revenue
base, or a growth flywheel for loa-arcturus at current prices.

### 0.4 Where docs conflict with code (authority rulings)

| Conflict | Ruling |
|---|---|
| Forum ERA repayment narrative vs. DES contract (`debt` = emission counter, no repayment) | **Chain + docs are authoritative for mechanics.** ERA repayment is an off-chain contractual construct with **zero protocol enforcement** — i.e., Berachain itself lacks the measurement/servicing infrastructure the ERA program presumes. This gap is a capability loa-arcturus can sell (optional lane), not the product. |
| Forum "incentive marketplace will be deprecated" vs. docs (active, no ERA) | Docs/current mechanics authoritative; forum = stated intent, unscheduled. |
| arcturus README/`DEPENDENCY-PINNING.md` vs. reality | `NOTES.md` + `e2e-evidence.md` authoritative: dune mode **does not compile** (missing sibling modules, `src/adapters/chain/{dune-sim-client,hybrid-provider,provider-factory}.ts`); `verify.ts:109` constructs **MockChainProvider unconditionally**; "PoC COMPLETE" means **mock-mode complete** — no Bepolia tx ever broadcast (`e2e-evidence.md:47-63`). |
| ledger-api README "signed mutation event-sourced ledger" vs. code | Code authoritative: **no signature verification exists**; in-memory stub; no HTTP runtime, no hash chain. |
| identity-api spec memory ("svc-JWT claims carry berachain/tier/pool_id") vs. code | Code: those claims live on the **user-session plane only** (`packages/protocol/src/jwt-claims.ts:22,47,52`); svc-plane claims are `{iss,aud,sub,iat,exp,nbf,role,jti}` (`svc-jwt-claims.ts:86-95`). |
| freeside "Ed25519 envelope everywhere" | `@0xhoneyjar/events` (hash-chain + Ed25519, `packages/events/src/envelope.ts:5-24`) exists and is real, but **no import of it exists inside the credit/billing money path** — discipline designed, adoption unfinished. |
| arcturus oracle affiliate filter | Filter 1 is a **production no-op**: allowlist defaults to intentionally-unmatchable placeholders (`src/oracle/config.ts:49-91`) until a real cited address list is supplied. |

---

## 1. The Recommendation

### 1.1 What loa-arcturus IS

**loa-arcturus is a Berachain-attached verified-cash-flow credit system for metered digital
businesses — AI agents and AI-powered applications first.** It turns objectively metered revenue
(x402 receipts, cost-atom-metered usage, on-chain settlement events) into (a) a deterministic,
replayable **economic identity and repayment history**, and (b) **bounded, short-tenor,
operator-funded working-capital facilities** serviced against that metered revenue, repaid in HONEY
on Berachain rails.

Three strictly separated layers (naming per the goal):

1. **Loa-Arcturus Protocol** — hounfour-governed schemas, evidence formats, invariants, and
   conformance vectors: EvidenceBundle, QualifiedRevenueAttestation, FacilityAgreement,
   RepaymentSchedule, ReturnLedgerEntry, identity-graph records. Versioned (N/N-1), vector-tested,
   replayable by third parties. Anyone may implement it.
2. **Canonical Loa-Arcturus Network** — the operated deployment assembled from the Loa stack:
   evidence intake (finn x402 verification + cost-atom), the deterministic oracle (arcturus filters),
   the money ledger (freeside/billing-api lot ledger + overspend), identity (identity-api), indexing
   (sonar). It computes truth; it holds no risk policy.
3. **Loa-Arcturus Operator** — the legal counterparty that owns keys, capital, risk policy, facility
   terms, servicing, collections, defaults, and disputes. The Operator consumes Network outputs
   under the Protocol's invariants; it is the only entity that can lose money, and in Lanes A–C it
   is the only entity that does.

### 1.2 What loa-arcturus IS NOT

- **Not an emissions faucet or "permissionless PoL access layer"** (rejects `07-reframe` as
  product identity — §2.3).
- **Not a revenue-truth oracle billed to the Foundation** as its primary business (rejects
  `01-blueprint` §6 as primary — the machinery survives as the underwriting evidence engine, and
  the ERA-referee capability remains an optional side contract).
- **Not a lending market, a Bend/Morpho fork, or a Dolomite integration.** Secured token-collateral
  lending is a commodity already on Berachain ($22M + $9.4M TVL doing exactly that). The
  uncommoditized asset is **verified cash-flow history for businesses that have no liquid
  collateral** — which is what agents, apps, DePIN nodes, and creators actually are.
- **Not a marketplace, not an agent registry, not an SDK.** finn EXP-002 settled this empirically:
  39,999 registered agents → ~0 transacting ("registration theater," loa-finn README). Registries
  without money flow are theater; loa-arcturus starts from the money flow.
- **Not a public credit pool at launch.** No lender funds, no deposit-taking, no vault token until
  the §8 gates pass.

### 1.3 First product: **Metered-Revenue Facilities (MRF)**

A bounded, short-tenor working-capital facility for a business whose revenue and/or costs are
objectively metered on rails the Network can verify:

- **Form 1 — Deferred settlement (post-paid metering):** the counterparty's metered usage
  (inference/API costs) settles weekly in arrears instead of prepaid, up to a hard cap. This is
  billing-api's existing `overspend` primitive (`packages/protocol/src/Ledger.ts:41-62` — overspend
  represented honestly, never rejected) upgraded with a cap, a schedule, and a cure obligation.
- **Form 2 — Revenue advance:** cash advance ≤ *k* × trailing-28-day **oracle-qualified**
  (arms-length, wash-filtered) revenue, repaid as a fixed split of incoming metered receipts plus a
  weekly true-up, full amortization ≤ 8 weeks.

Both forms are underwritten **deterministically**: the advance-sizing rule is a published function
of oracle output (qualified revenue, payer diversity, history length) with versioned parameters.
LLMs may draft memos and flag anomalies; **no LLM output authorizes capital** — the authorization
path is rule + human Operator sign-off, both logged.

### 1.4 First economically meaningful user

**A revenue-generating AI/API business with arms-length metered receipts — an external design
partner, not an anonymous agent and not an affiliate.**

- **Cohort 0 (instrumentation shakeout, weeks 0–4):** 1–2 affiliated tenants already metered by the
  finn→billing-api wire (e.g., the NFT-gated chat product). Purpose: exercise the loop end-to-end.
  **Excluded from all proof claims** — the PoC's flagship anti-self-grading property
  (`oracle.ts` Filter 1) applies to the lender too: lending to yourself proves nothing and
  contaminates the dataset.
- **Cohort 1 (the actual test, weeks 4–16):** 3–5 external sellers on the x402 rail. Honest
  tension, stated: real x402 volume today is ~93% Base, ~$0 Berachain. Evidence may therefore
  originate cross-chain; **the Berachain attachment is enforced on the liability side** — facilities
  denominated and repaid in HONEY (EIP-3009 native, gasless via EIP-7702), driving HONEY mint
  demand and polFeeCollector→sWBERA flow regardless of where the receipts live.

### 1.5 Smallest closed economic loop

```
 enroll (permissionless)          underwrite (deterministic rule,      disburse (HONEY,
 wallet SIWE → obligor identity   Operator-signed, no LLM authority)   bounded ≤ cap)
        │                                   ▲                              │
        ▼                                   │                              ▼
 meter work ──────────────► oracle: qualified revenue ◄────────── workload continues
 (x402 receipts: true payer      (affiliate/dust/circular filters,        │
  from Transfer log, fail-closed; byte-identical replay)                  ▼
  cost-atoms: fail-closed JSONL)                                   repay from receipts
        ▲                                                          (weekly, HONEY)
        │                                                                 │
        └──────────── repayment history (hash-chained, portable) ◄───────┘
                       → cap adjusts next cycle (up on cure, down on miss)
```

Every leg has an existing primitive except two: **disbursement** and **RepaymentSchedule** (both
net-new, both small). The loop closes in one week per cycle; eight cycles produce a repayment
history — the asset the whole thesis is about.

### 1.6 Roles of the four capital sources

| Source | Role | Hard rule |
|---|---|---|
| **PoL Next emissions (Lane A)** | Optional, deferred participation subsidy: a whitelisted reward vault may later stream WBERA to enrolled, verified-active counterparties. Also: the ERA-referee/measurement capability remains separately sellable to the Foundation. | **Never funds facilities, never absorbs losses, never counts as "value returned."** Quarantined accounting (§4, §5). |
| **Operator private capital (Lane B)** | Funds 100% of facilities and bears 100% of first loss through the entire experiment and pilot phases. | The only at-risk capital until §8 Gate G3. |
| **Dolomite / Bend (Lane C)** | External secured venues where counterparties (or the Operator treasury) may independently obtain token-collateralized leverage. The Network may *read* these positions (via sonar) as underwriting evidence. | loa-arcturus never intermediates, never takes venue dependency, never rehypothecates. Venue liquidity is ephemeral — treat as observable state, not infrastructure. |
| **Lender-funded Agent Credit Vaults (Lane D)** | Future senior capital behind an Operator junior tranche, only after §8 gates. | Does not exist until then; no design commitments now beyond the Return Ledger being built Lane-D-ready. |

### 1.7 Permissionless vs. underwritten (the line)

**Permissionless:** enrollment (wallet SIWE → obligor identity, self-service), evidence submission,
metering, score computation, reading your own history, exporting signed attestations of your own
history. This is the Protocol/Network side — a meter is free.
**Underwritten:** anything that moves the Operator's money — facility grant, cap size, disbursement.
Operator policy, 2-of-N human keys (identity-api's `operator_grants` 2-of-3 discipline,
`0004_operator_grants.up.sql:97-124`, is the right shape here — its manual-ness is a feature on
this side). *Permissionless participation is not unconditional borrowing*: enrollment gives you a
meter, not money.

### 1.8 Who bears first loss

The **Operator**, with its own capital, absolutely, in every lane that exists at launch. PoL
emissions never backstop credit losses (that would launder emissions into loss subsidies — the
exact "sunk cost" pathology PoL Next exists to escape). Lenders bear loss only in Lane D, only
behind a funded Operator junior tranche, only after §8.

### 1.9 Objective value returned to Berachain

Measured, not narrated — these are Return Ledger line items (§5), reported per epoch:

1. **HONEY demand:** gross HONEY acquired/minted by counterparties to service repayment; mint/redeem
   fees generated → polFeeCollector → sWBERA yield (mechanical, on-chain, attributable).
2. **Metered on-chain settlement activity:** x402-in-HONEY settlement volume + gas on 80094.
3. **Credit-history infrastructure the chain lacks:** ERA repayment is currently unenforceable and
   unmeasured (§0.4 ruling 1). A working verified-cash-flow servicing stack is the missing
   instrument for the chain's own flagship program — sellable to the Foundation without being
   load-bearing for arcturus survival.
4. **Honest reporting of (1)–(3):** at MVE scale these numbers are small; publishing them small is
   the credibility product (the PoC's "willing to publish ≈ $0" property, preserved).

### 1.10 What falsifies the thesis

| # | Falsifier | Where tested |
|---|---|---|
| F1 | **Demand:** no external counterparty accepts a fee-bearing facility within 8 weeks of pipeline effort | §7 MVE |
| F2 | **Evidence integrity:** a planted wash-revenue borrower obtains a facility, or forgery cost measured < cap extracted | §7 red-team control |
| F3 | **Unit economics:** realized losses + servicing cost structurally exceed fee income at bounded caps across 2 cohorts | §7/§8 |
| F4 | **Identity value:** repayment history shows no predictive lift over a naive baseline (e.g., "everyone repays"/"size on raw revenue") after ≥8 cycles — the "economic identity" asset is worthless | §7 outputs |
| F5 | **Berachain attachment:** HONEY settlement friction (pausable admin, mint UX, bridge cost) drives counterparties to repay elsewhere — the product may survive chain-agnostic; the Berachain mandate dies | §7 controls |

---

## 2. Accept / Reject Decisions

| Proposal | Decision | Reasoning (pinned) |
|---|---|---|
| **Generic PoL SDK** | **REJECT** | Berachain works without loa-arcturus; an SDK has no counterparty, no moat, no revenue, and tests nothing about the credit thesis. Infrared/Kodiak already abstract vault access. |
| **Universal agent marketplace** | **REJECT** | finn EXP-002: 39,999 registered → ~0 transacting. Marketplaces aggregate demand that does not exist yet; arcturus starts from verified money flow instead. |
| **Emissions faucet** ("permissionless PoL access layer," `07-reframe`) | **REJECT as product; retain as deferred Lane-A option** | (a) Distribution business, not a credit business — tests none of the hypothesis. (b) At $0.17 BERA the total distributable pool is $3.55M/yr and a new vault's share is validator-allocated, requiring ≥$100k TVL + ≥$10k/mo incentives for ≥2 months + governance + validator adoption — negative carry to distribute a sliver. (c) The moment it pays without underwriting it is a sybil bounty; realness-weighting recreates the whole oracle-hardening program with a *live faucet attached before the meter is proven on real data* (the meter has never scored a real tx — §0.4). |
| **Bend fork** | **REJECT** | Bend is itself a Morpho v1.1 fork at $9.4M TVL. Forking a secured-lending market tests token-collateral liquidation, not cash-flow underwriting. Future revenue is not liquid token collateral — a Morpho-shaped venue cannot express the product. |
| **Dolomite dependency** | **REJECT dependency; ACCEPT as observable Lane-C venue** | Dolomite ($22M TVL) is a counterparty's own secured-leverage choice. Reading positions as evidence: yes (sonar). Building on it: no — venue liquidity is ephemeral; a venue outage must not be able to halt underwriting or servicing. |
| **Public pool at launch** | **REJECT** | No repayment-history data exists anywhere in the stack (all 11 repos: zero lending primitives). Taking lender money before the loss distribution is measured is underwriting theater. Gates in §8. |
| **Pure oracle without servicing** | **REJECT** | Three reasons: (1) data-selling starves (Graph <$99k/qtr; Pyth <$50k cumulative — `01-blueprint` evidence base); (2) the only oracle customer is the Foundation, untested, single-point; (3) **without servicing there is no repayment history, and the repayment history is the asset.** The oracle is the kernel, not the product. |
| **Full-stack integration before proving the kernel** | **REJECT** | The `07-reframe` "~90% assembled, integration effort" claim is falsified by inspection: the oracle never ran on real chain data; finn x402 is unmounted; freeside verifiers uninjected; billing rails absent; sonar lacks PoL/Bepolia; identity has no agent entity. Integrating eleven services around an unproven kernel maximizes cost to learn nothing. MVE uses the **minimum** set (§7.2). |

---

## 3. Actor / Counterparty Map (who owes what to whom)

```
                         ┌────────────────────────────────────────┐
                         │      BUYERS / PAYERS (arms-length)      │
                         │  owe: payment for services (x402/HONEY)│
                         └──────────────┬─────────────────────────┘
                                        │ metered receipts (the cash-flow source)
                                        ▼
┌──────────────────┐  evidence   ┌──────────────────┐   facilities    ┌──────────────────┐
│  COUNTERPARTY     │───────────►│  CANONICAL        │◄───capital──────│  OPERATOR         │
│  (obligor =       │            │  NETWORK          │                 │  (risk owner)     │
│  controller ×     │◄───scores──│  (computes truth) │────outputs────► │                   │
│  application)     │            └──────────────────┘                 └──────────────────┘
└──────────────────┘                     ▲                                   │
                                         │ schemas, invariants,              │ (Lane D only,
                                         │ conformance vectors               │  post-§8 gates)
                                  ┌──────┴───────────┐                ┌──────▼───────────┐
                                  │  PROTOCOL         │                │  LENDERS          │
                                  │  (rules of proof) │                │  (senior, future) │
                                  └──────────────────┘                └──────────────────┘

  BERACHAIN / FOUNDATION (no obligation either way; two optional contracts:
  Lane-A reward-vault whitelist; ERA-referee measurement services)
  PROVIDERS (RPC, model APIs, x402 facilitators): service dependencies, no credit relationship
  MARKETPLACES / AGGREGATORS: sub-attribution duty if their sellers enroll (D20 lineage)
```

| Actor | Owes | To whom |
|---|---|---|
| **Counterparty (obligor)** | Truthful evidence; repayment of principal + fees per FacilityAgreement; cure of overspend within cure window | Operator |
| **Operator** | Disbursement per agreement; accurate accounting; published risk-policy version; dispute process; confidentiality of business evidence (§5.4); first-loss capital | Counterparty; (future) Lenders |
| **Canonical Network** | Deterministic, byte-replayable scores; published methodology version; evidence custody; no LLM in the authorization path; equal treatment (anti-self-grading: affiliates flagged, never favored) | Everyone |
| **Protocol** | Versioned schemas (N/N-1), conformance vectors, stable invariants | Implementers |
| **Lenders (Lane D, future)** | Capital per vault terms; no interference in servicing | Operator (senior position) |
| **Buyers/payers** | Payment for services rendered | Counterparty |
| **Marketplaces** | Verifiable per-end-user sub-attribution for enrolled sellers (no self-declared aggregation) | Network |
| **Berachain/Foundation** | Nothing (by design). Optionally: whitelist decision (Lane A); ERA-referee fees (separate contract) | — |

**Separation invariants:** the Operator can change risk policy but cannot change what the Network
computed (methodology is Protocol-versioned; outputs are hash-chained). The Network can be forked
by anyone under the Protocol; the Operator's book cannot. The Protocol never holds funds.

---

## 4. Four Capital Lanes — funds flow and accounting boundaries

| | **Lane A — PoL incentives** | **Lane B — Arcturus facilities** | **Lane C — secured venues** | **Lane D — Agent Credit Vaults** |
|---|---|---|---|---|
| Nature | Non-repayable emissions subsidy | Cash-flow working capital (the product) | Counterparty's own secured borrowing | Lender-funded senior credit |
| Funder | Berachain protocol (WBERA emissions) | Operator equity | Dolomite/Bend LPs | External lenders |
| Recipient | Enrolled verified-active counterparties (deferred) | Obligors under FacilityAgreement | Counterparty directly | Facilities (via Operator servicing) |
| Repayable? | **No** (grant-shaped) | **Yes** — principal + fees, ≤8-week amortization | Yes, to the venue (not to Arcturus) | Yes, waterfall: senior → junior |
| First loss | N/A (nothing at risk) | Operator 100% | Venue LPs / liquidators | Operator junior tranche ≥20%, then lenders |
| Status | **Deferred** (post-MVE option) | **Now** (MVE) | Observed only | **Gated** (§8) |
| Funds flow | RewardVault → getReward → counterparty wallet | Operator treasury → HONEY disbursement → obligor; receipts → repayment split → treasury | counterparty ↔ venue | vault → Operator facility pool → obligors; repayments → waterfall |
| Accounting | **Quarantined ledger partition**; never enters facility P&L; never counted as "value returned" | Full Return Ledger (§5) | Read-only mirror entries (evidence) | Return Ledger + tranche sub-ledger |

**Boundary rules (hounfour conservation constraints, machine-checked):**

1. **No journal entry crosses lanes.** The only permitted inter-lane flow is an explicit,
   fee-labeled transfer (e.g., Lane-A keeper fee → Operator revenue), each an auditable event.
2. **Lane A cannot cure Lane B.** An emission receipt can never satisfy a repayment obligation —
   repayment is cash (HONEY/USDC) from the obligor. (Otherwise "repayment" is just emissions
   round-tripping — the wash the oracle exists to detect, committed by the operator itself.)
3. **Lane C is evidence, not collateral.** A Dolomite/Bend position may raise or lower a cap as an
   underwriting *input*; it is never pledged to, seized by, or relied on by the Operator.
4. **Lane D inherits B's books.** The Return Ledger schema is Lane-D-ready from day one (tranche
   dimension present, zero-filled), so graduation is a funding event, not a re-architecture.

---

## 5. The Return Ledger

Purpose: one auditable, double-entry, lane-partitioned ledger answering *"what came in, where did
it go, what came back, and what did Berachain get"* — deterministically, per epoch (weekly).

**Substrate:** billing-api's `PgCreditLedger` pattern (append-only `credit_lots`/`lot_entries`,
SECURITY-DEFINER insert gate, BigInt micro-units, idempotent finalize —
`packages/adapters/migrations/0002_credit_lots_lot_entries.sql`) extended with facility tables;
every entry carries `{token, decimals, amountAtoms}` (killing the `micro-USDC == micro-USD` weld
before HONEY's 18 decimals, per `08-unix` divergence #3); envelope-sealed per epoch with
`@0xhoneyjar/events` (hash-chain + Ed25519, `loa-freeside packages/events/src/envelope.ts:5-24`).

### 5.1 Chart of accounts (minimum)

| Account | Lane | Meaning |
|---|---|---|
| `CAPITAL_RECEIVED{lane, source}` | A/B/D | Operator equity in; emissions in (A, quarantined); lender funds in (D) |
| `ALLOCATED{facility_id}` | B/D | Capital committed to a facility (cap, not necessarily drawn) |
| `PRINCIPAL_OUTSTANDING{facility_id}` | B/D | Drawn and unrepaid |
| `CASH_REPAYMENT{principal | fee}` | B/D | Obligor cash in, split at entry time |
| `REVENUE_SHARE_ACCRUED / _COLLECTED` | B/D | Where terms include a revenue-share component |
| `FEES_EARNED{origination | servicing | late}` | B/D | Operator income |
| `HONEY_DEMAND_GROSS` | cross | HONEY acquired/minted by obligors to service obligations (measured from mint + transfer evidence) |
| `HONEY_MINT_FEES_ATTRIBUTED` | cross | polFeeCollector-bound fees caused by (↑), methodology-versioned |
| `WBERA_EMISSIONS_RECEIVED` | A only | Quarantined; never nets against B/D |
| `SWBERA_SINK_FLOWS` | cross | sWBERA accrual attributable to arcturus-caused activity |
| `ATTRIBUTED_VALUE_BERACHAIN` | report | Derived line: (HONEY fees + gas + sink flows) — **never includes Lane A** |
| `DEFAULTS{facility_id}` | B/D | Obligation ≥ X days past cure window (proposed X=30) |
| `RECOVERIES{facility_id}` | B/D | Post-default cash in |
| `REALIZED_LOSSES / WRITE_OFFS` | B/D | Defaults − recoveries, recognized at write-off |

### 5.2 Conservation invariants (shipped as hounfour ConstraintFiles + vectors)

- Per facility: `drawn == repaid_principal + outstanding + written_off` (bigint exact).
- Per lane: `Σ inflows == Σ outflows + Δholdings` per epoch; cross-lane entries only via labeled
  fee transfers (§4 rule 1).
- `ATTRIBUTED_VALUE_BERACHAIN` computable **only** from cross-lane accounts; any formula referencing
  `WBERA_EMISSIONS_RECEIVED` fails validation.
- Epoch seal: RFC-8785-canonical JSON of the epoch's entries, sha256, hash-chained, Ed25519-signed;
  reproducible from the underlying receipts by a third party holding the evidence snapshot.

### 5.3 Reporting

Weekly epoch report (public, redacted per §5.4): totals per account, per-cohort loss triangle,
`$ value returned to Berachain per $1 of facility volume`, and — if Lane A ever activates —
emissions received vs. verified activity, kept visually and arithmetically separate.

### 5.4 Confidentiality boundary

Business evidence (payer identities, per-buyer volumes, margins) is confidential; methods are
public. Publication surface: aggregates, bands, and proofs (epoch seal hashes, methodology version,
conformance-vector results). Auditors under NDA can replay byte-identically from snapshots; the
public can verify the seals. (This is the PoC's determinism property doing double duty as the
disclosure mechanism.)

---

## 6. Economic Identity Graph

**Credit attaches to the obligor = (CONTROLLER × APPLICATION), never to wallets or agent
instances.** Wallets rotate, instances are cattle; the controller-application pair is what earns a
history and can default.

```
CONTROLLER (human/org; identity-api `users` + SIWE; 2-of-3 grants for underwritten ops)
   │ controls (attested key ceremony; P-256 passkey wallets post-Fusaka EIP-7951)
   ▼
APPLICATION (product/tenant; billing account = "one community = one billing account",
   │          billing-api packages/protocol/src/context.ts:5-6)
   │ operates
   ▼
AGENT_CLASS (methodology/config archetype — score-api resolveConfig pattern: class is CONFIG)
   │ instantiates
   ▼
AGENT_INSTANCE (runtime process; finn WAL identity; ephemeral, never an obligor)
   │ earns-into
   ▼
WALLET(S) (identity-api wallet_links, chain-scoped; many-per-obligor; rotation expected)
   ▲
   │ funding/sweep edges (oracle funding-graph.ts — cycle detection, external-origin)
   │
PAYERS ──(arms-length? affiliate? dust? circular?)── ORACLE FILTERS decide qualification

Side entities:
AFFILIATE_SET   — operator/0xHJ-affiliated addresses; Filter-1 input; MUST be populated with
                  real cited addresses (today it is placeholder no-ops — §0.4)
MARKETPLACE     — aggregator node; qualification requires per-end-user sub-attribution
                  (mandate-hash linkage), never self-declaration (blueprint D20, retained)
PROVIDER        — model APIs, RPC, x402 facilitators; cost-side evidence (cost-atoms), no credit
```

**Identity mechanics from the stack:** enrollment = SIWE challenge/verify
(identity-api `src/api/routes/auth.ts`) minting an obligor record — permissionless, self-service
(net-new surface; the existing `operator_grants` manual 2-of-3 plane stays for underwritten
operations). History portability = signed QualifiedRevenueAttestations (hounfour schema, Ed25519
envelope) the obligor can present elsewhere — the history is theirs; the underwriting is ours.
**Sybil economics:** per-obligor caps obey the forgery-cost invariant — cap < measured cost of
fabricating the qualifying history (wash fees + gas + time-in-history + facilitator costs), with
the planted-forgery red team (§7) continuously re-measuring that cost. A fresh identity with no
history gets cap $0 by rule; history cannot be rented because attestations bind to the controller
key ceremony.

---

## 7. The Minimum Viable Experiment (MVE): "Meter-to-Credit Loop v0"

**Question:** does a bounded facility underwritten purely from deterministic, wash-filtered metered
revenue get repaid — and does anyone want it?

### 7.1 Design

| Parameter | Value (proposed defaults) |
|---|---|
| Workload | Objectively metered API/inference revenue on the x402 rail (HONEY EIP-3009 preferred; USDC receipts admissible as evidence) + cost-atom-metered spend for Form-1 |
| Participants | Cohort 0: 1–2 affiliated tenants (shakeout only, excluded from proof). Cohort 1: **3–5 external** obligors. 1 planted red-team obligor (see Controls) |
| Facility forms | Form 1 deferred settlement (cap = min($1,000, 2× trailing-week metered spend)); Form 2 revenue advance (cap = min($2,000, 50% × trailing-28d qualified revenue)) |
| **Total program risk cap** | **$10,000 Operator capital, hard.** Per-obligor ≤ $2,000 |
| Tenor / cycle | Weekly settlement epochs; full amortization ≤ 8 weeks; 12-week program |
| Pricing | Origination 1% + 2% per 30 days outstanding (≈26% APR-equivalent) — deliberately non-teaser: F1 (demand) is only falsified by a *fee-bearing* offer |
| Repayment | HONEY via EIP-3009 x402 rail (gasless); USDC fallback admissible but logged as F5 evidence |
| Underwriting rule | Published deterministic function `cap = f(qualified_revenue_28d, payer_diversity, history_weeks)`, versioned in hounfour; human Operator co-sign; **no LLM in the path** |
| Evidence | Per epoch: x402 receipts (true-payer from Transfer logs — finn `receipt-verifier.ts:317-373` semantics), cost-atom JSONL seals, oracle run (methodology v, `asOf`, byte-identical replay), Return Ledger epoch seal. Snapshot archived; any decision reproducible from snapshot alone |
| Preconditions (2–3 weeks build) | ① Oracle passes **Assertion C live** — real Bepolia/mainnet txs scored (never done: `e2e-evidence.md:47`); ② real affiliate allowlist populated (Filter 1 currently no-op); ③ x402 wire unified on hounfour schema, finn verifier mounted with Berachain+HONEY `CHAIN_CONFIGS` and decimals-aware amounts; ④ FacilityAgreement + RepaymentSchedule + ReturnLedgerEntry schemas + vectors in hounfour; ⑤ HONEY disbursement/collection wallet under 2-of-3 |

### 7.2 Minimum component set (everything else stays on the shelf)

finn x402 verification module (mounted, extended) · finn cost-atom · arcturus oracle (live-data
mode) · billing-api ledger + overspend (+facility tables) · identity-api SIWE enrollment ·
hounfour schemas/vectors · one HONEY treasury wallet. **Not in the loop:** sonar (batch evidence
pulls suffice at N=5), score-api, dixie, ledger-api, any Solidity, any reward vault, AWS migration.

### 7.3 Controls

1. **Prepaid control group:** 2+ comparable tenants staying prepaid — measures volume/retention
   lift attributable to credit (demand quality, not just uptake).
2. **Planted forgery (red team):** one internally-operated obligor manufacturing wash revenue
   (self-funded payer rings, circular flows, dust) at a measured dollar cost, attempting to
   qualify. **Pass:** filters exclude it and its cap stays $0. **Fail = F2 kill:** it obtains any
   facility, or measured forgery cost < obtainable cap.
3. **Determinism audit:** every underwriting decision replayed byte-identically from snapshot by a
   second machine (PoC Assertion-D discipline, now on real data).
4. **Rail-friction log:** every repayment's rail, latency, failure, and HONEY-pause exposure —
   the F5 dataset.

### 7.4 Outputs (all numeric, all published in bands)

Repayment matrix per obligor-epoch · default/cure/loss rates vs. the $10k cap · fee income vs.
servicing cost per facility (unit economics) · oracle precision/recall on the planted forgery +
measured forgery cost · predictive lift of history-based caps vs. naive baseline (F4) · HONEY
demand generated (Return Ledger) · demand funnel (offers → signed → drawn).

---

## 8. Graduation / Kill Gates (numeric)

**Stage ladder:** S0 MVE (§7) → S1 Operator book expansion → S2 private lender notes → S3 public
Agent Credit Vaults (Lane D). All thresholds are proposed defaults; each gate evaluation is itself
a Return-Ledger-sealed artifact.

### Kill gates (any → halt stage, publish post-mortem, fix-or-stop)

| # | Trigger | Effect |
|---|---|---|
| K1 | Planted forgery obtains any facility, or measured forgery cost < 2× obtainable cap | Freeze all new facilities until methodology fix + re-red-team |
| K2 | Realized program loss > 30% of stage risk cap | Kill stage; thesis F3 presumed until re-underwritten |
| K3 | Zero external signed facilities after 8 weeks of active pipeline (≥20 qualified offers made) | Demand falsified (F1); stop; product pivot decision to owner |
| K4 | Any capital authorization traced to LLM output, or any decision not byte-replayable from snapshot | Immediate freeze; governance incident (this is the constitution, not a metric) |
| K5 | History-based caps show no loss-predictive lift over naive baseline after ≥8 cycles/obligor across ≥8 obligors | F4: identity asset worthless; do not proceed past S1 |

### Graduation gates

| Gate | From → To | Numeric conditions (ALL required) |
|---|---|---|
| **G1** | S0 → S1 (book to $50k, ≤$5k/obligor) | ≥3 external obligors completed ≥4 clean cycles each · realized loss ≤ 10% of drawn volume · red-team passed twice · 100% decisions replayable · servicing cost ≤ 40% of fee income |
| **G2** | S1 → S2 (private notes ≤$250k, Operator junior ≥30%) | ≥10 distinct external obligors · ≥100 completed obligor-epochs · trailing-2-cohort realized net loss ≤ 5% of drawn · fee income ≥ 1.5× (losses + servicing) · dispute process exercised ≥1× end-to-end · legal opinion on facility form + HONEY settlement in operating jurisdiction |
| **G3** | S2 → S3 public vaults (initial cap ≤$250k senior, Operator junior ≥20% funded, per-lender ≤10%) | ≥12 months servicing history · ≥50 obligors, ≥500 obligor-epochs · realized net loss ≤ 3% across ≥2 full amortization cohorts · loss volatility: no single cohort > 6% · forgery cost re-measured ≥ 5× max cap · methodology + Return Ledger publicly replayed by ≥2 independent parties · on-chain facility registry + epoch-seal publication live and audited · securities/lending counsel sign-off in issuing jurisdiction · Foundation/ecosystem notice (courtesy, not permission) |

**Lane A activation gate (independent):** only after G1, only if a whitelisted vault's expected
annual WBERA share ≥ 3× its bootstrap + compliance cost at spot prices — else it stays shelved
(at $0.17 BERA this fails today, which is the point of making it a gate).

---

## 9. Repository Capability Map

| Repo @ SHA | Verdict | Specifics |
|---|---|---|
| **loa-arcturus** @ `9313716` | **EXTRACT (the kernel) + fix** | Oracle filter stack + determinism harness (`src/oracle/*`) becomes the underwriting evidence engine. Must fix before real money: Filter-1 placeholder allowlist (`src/oracle/config.ts:49-91`); mock-only provider (`scripts/verify.ts:109`); Assertion C never run live; `Number()` precision ceiling in confidence diagnostic; dormant double-nonce bug if routes ever mount (`x402.routes.ts:253` + `x402-settlement.ts:238`). |
| **loa-hounfour** @ `e24752e2` | **REUSE (protocol substrate)** | CONTRACT_VERSION 8.7.0, N/N-1, 1,241 vectors, cross-runner byte-identity (`scripts/run-cross-runners.sh`), constraint DSL with `bigint_sum` conservation + temporal operators (`src/constraints/evaluator.ts`), conservation-law factories (`src/commons/conservation-law-factories.ts:32-183`). Net-new schemas: FacilityAgreement, RepaymentSchedule, ReturnLedgerEntry, EvidenceBundle, QualifiedRevenueAttestation. Heal the finn-vs-canonical x402 wire divergence (`loa-finn src/x402/types.ts:6` acknowledges it). |
| **loa-finn** @ `69f3f8a7` | **EXTRACT x402 + cost-atom; ADAPT configs** | `src/x402/` (true-payer from Transfer logs `receipt-verifier.ts:317-373`, fail-closed single-match, EIP-3009 `verify.ts:71-194`, atomic Redis nonce; **no Permit2**) — mount it; add Berachain 80094/80069 + HONEY to Base-only `CHAIN_CONFIGS` (`types.ts:130-143`) with `{token,decimals,amountAtoms}`. Cost-atom (`src/cost/cost-atom.ts`, fail-closed close-before-response) = Form-1 metering. Berachain RPC already proven in prod boot (`src/index.ts:627-636`). |
| **loa-freeside** @ `8e616437` | **REUSE ledger patterns + events package; ignore the rest for MVE** | Conservative-quote-settle invariant (`packages/services/x402-settlement.ts:196-201`), conservation-guard I-1/I-2/I-3, `@0xhoneyjar/events` Ed25519+hash-chain envelope (wire it into the money path — it isn't today). `X402PaymentAdapter` (real 8-point verifier) is Base/USDC-hardcoded and uninjected — reference, don't lift. |
| **billing-api** @ `7903cf9a` | **ADAPT (the facility ledger)** | `PgCreditLedger` append-only double-entry + SECURITY-DEFINER gate + **overspend** primitive (`Ledger.ts:41-62`) is Form-1 minus cap/schedule/cure. Add facility tables, Return Ledger accounts, HONEY rails (its `credit_lots.source` enum already anticipates `'x402'`, `0002…sql:19-35`). |
| **identity-api** @ `bca4412c` | **ADAPT** | SIWE challenge/verify + JWKS svc-JWT = obligor enrollment substrate. Keep `operator_grants` 2-of-3 **manual** for underwritten ops (feature, not gap); build permissionless self-enrollment only on the metering side. No agent entity exists — obligor model is net-new schema. |
| **sonar-api** @ `b3209fd8` | **DEFER (post-MVE ADAPT)** | No PoL-core contracts, no Bepolia, reindex cost real (`SCALE.md:15`). At N=5 obligors, direct RPC evidence pulls suffice. Later: sidecar belt for HONEY transfers + receipt contracts. |
| **score-api** @ `61773656` | **DEFER; reuse patterns only** | Domain mismatch (NFT-holding conviction ≠ cash-flow credit; `defi_reliability` goal was deleted, `goalRegistry.ts:48-53`). Its *shape* — deterministic engine, config-not-code onboarding, bands-never-raw-scores, glass-box explain — is the template for exposing repayment history. |
| **loa-dixie** @ `d36c0846` | **DEFER (post-G1 enrichment)** | EMA/Bayesian/decay reputation math + hash-chained audit-trail stores are the right machinery for *maturing* repayment-history scoring — after there is repayment history to score. |
| **ledger-api** @ `1a1a95e8` | **REJECT for the money path** | Skeleton; no signatures despite README; no runtime. billing-api is the ledger. Revisit only if resource-generic accounting is needed later. |
| **loa** @ `d75f5b60` | **REUSE as dev substrate; do not repurpose L4** | Graduated-trust is dormant bash gating dev autonomy — the *tier-semantics* inspire credit tiers, but implement them in hounfour/Postgres, not the bash lib. |
| **Prior briefs** `01/06/07/08` | 01: revenue architecture REJECTED as primary, scoring/dispute/firewall machinery RETAINED for later stages; 06: reuse ledger stands; 07: REJECTED as product identity, Lane-A option retained; 08: contract/swap discipline ADOPTED wholesale (write WeightVector→now FacilityAgreement-class schemas first; heal the three divergences — same order, new names). |

---

## 10. Unknowns Register

**Product**
- Real willingness-to-pay for post-paid metering / revenue advances at ~26% APR-equivalent at
  micro scale (MVE F1/K3 resolves).
- Whether external x402 sellers will accept HONEY-denominated liabilities when their receipts are
  Base/USDC (F5; rail-friction log resolves).
- Right first vertical after AI/API: DePIN nodes and creator payouts are metered too — untested.

**Protocol**
- ERA playbook contents and whether the Foundation will buy measurement/servicing (optional lane;
  do not depend on it).
- Incentive-marketplace deprecation timing (forum intent vs. live docs) — affects Lane-A math.
- Marketplace sub-attribution standard (AP2/a2a-x402 mandate-hash) maturity.

**Economics**
- BERA price path: all Lane-A math is spot-price-fragile ($3.55M/yr pool today).
- True forgery cost on a wash-filtered rail (red team produces the first measurement).
- Loss-given-default for pure cash-flow micro-facilities with no collateral (no data anywhere;
  the MVE exists to create it).
- Servicing unit cost at N=50+ (automation ceiling).

**Legal**
- Lending licensure / usury treatment of the facility forms per operating jurisdiction (G2 blocker).
- Securities characterization of Lane-D vault interests (G3 blocker).
- HONEY as settlement instrument: pausable-admin counterparty risk; e-money characterization.
- Confidential-evidence handling vs. auditability (NDA replay framework).

**Data**
- Berachain-native metered revenue is ~nil today; cross-chain evidence + Berachain liabilities is
  the bridge — how long until native receipts exist (x402 `0x4020` still undeployed on 80094)?
- Payer-identity coverage: Dune Sim / archive-node dependency for funding-graph depth (dune adapters
  currently don't even compile in arcturus).

**Contracts (on-chain)**
- None required for MVE (deliberate). Later: facility registry + epoch-seal publication contract;
  audit cost/timing; whether receipts contract (PROOF-SCHEMA §3 client-signed payer) is worth
  deploying to harden evidence.

**Operations**
- Collections posture for defaulted micro-obligors (write-off-fast vs. pursue; reputational calculus).
- Key custody: 2-of-3 today; HSM/passkey (P-256 precompile) migration path.
- Dispute intake before the full Turing-gate machinery exists (manual runbook at MVE scale).
- Treasury FX: operator capital in USD/USDC vs. HONEY float exposure.

---

## 11. One-paragraph strategic summary

**loa-arcturus is the credit bureau plus lending desk for the metered machine economy, attached to
Berachain through the HONEY settlement rail — not an emissions product.** The stack's genuinely
differentiated assets are a deterministic wash-filtering revenue oracle, fail-closed payment
verification, and conservation-law-enforced ledgers; the missing 10% (facility schema, repayment
schedule, HONEY disbursement) is small and cheap. PoL Next capital is quarantined as a
non-repayable Lane-A subsidy that never funds or backstops credit; Dolomite and Bend are observed
venues, not dependencies; public Agent Credit Vaults exist only behind numeric gates (≥12 months,
≥50 obligors, ≤3% realized loss, independent replays, counsel). The fastest falsification is a
$10,000, 12-week, five-obligor experiment with a planted forger — if the filters hold, someone
borrows, and the history predicts, the thesis lives; if not, we learn it for four figures.
