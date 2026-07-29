# Loa-Arcturus v0 Build Pack — the smallest system that can falsify the thesis

**Status:** BUILD-READY SPECIFICATION. Date: 2026-07-27. Writes no production code.
**Author role:** principal engineer, Loa-Arcturus.
**Method:** independent capability audit of 11 default branches executed and *reproduced locally*
**before** reading `0xHoneyJar/loa-arcturus@f143cdb` or `grimoires/loa/next/09-decision-architecture.md`.
Claim classification in §1.6. Where sources conflict, the authority ruling is stated inline.

> **The thesis under test.** *An operator can advance capital to a metered digital-service provider
> against deterministically-qualified, wash-filtered external revenue, and get repaid from later
> receipts, at a loss rate that fee income covers.*
>
> **v0 is built to disprove that**, not to showcase it. Every component that is not required to
> produce a falsifying observation is out of scope.

---

## 0. Evidence base — pinned SHAs

All eleven repos cloned from their **default branches** on 2026-07-27 and audited at these exact
commits. Every `path:line` in this document resolves at these SHAs.

| Repo | SHA (full) | Branch |
|---|---|---|
| 0xHoneyJar/loa-arcturus | `f143cdb011a536c623823a3f9bcd1923066ccb80` | main |
| 0xHoneyJar/loa-hounfour | `e24752e22e3f71f566adc2b257ad70d50fc8d2d0` | main |
| 0xHoneyJar/loa-finn | `69f3f8a733b3607c79f57ebcfbc17164c307a9c3` | main |
| 0xHoneyJar/loa-dixie | `d36c0846f03bfd097d35dd2c001de19eec817cf0` | main |
| 0xHoneyJar/loa-freeside | `8e6164376d5c2439f95038b2626ee4be2ccde93d` | main |
| 0xHoneyJar/sonar-api | `b3209fd8fa65c9da8e03e987fcfdcb7991c3a938` | main |
| 0xHoneyJar/score-api | `61773656fe24143700285455fd57107b1acdaf35` | main |
| 0xHoneyJar/identity-api | `bca4412cfe268c877115921089f5f323b4a41f03` | main |
| 0xHoneyJar/billing-api | `7903cf9a66047a59f67fe7fc18551c06bd70c314` | main |
| 0xHoneyJar/ledger-api | `1a1a95e8b1ff5a55841c75323948798e8bd918ed` | main |
| 0xHoneyJar/loa | `d75f5b607900d5cfa9dd5b31e59988bf07f77f1c` | main |

### 0.1 On-chain facts re-verified live (2026-07-27, `rpc.berachain.com`)

| Check | Method | Result |
|---|---|---|
| Chain id | `eth_chainId` | `0x138de` = **80094** ✓ |
| HONEY `0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce` | `eth_getCode` | non-empty (EIP-1967 proxy bytecode) ✓ |
| HONEY `symbol()` | `eth_call 0x95d89b41` | `"HONEY"` ✓ |
| HONEY `decimals()` | `eth_call 0x313ce567` | `0x12` = **18** ✓ (**not 6** — see §1.6 C-7) |
| HONEY EIP-3009 | `eth_call authorizationState 0xe94a0102` | returns `0x00…00` → **selector exists** ✓ |
| HONEY EIP-2612 | `eth_call DOMAIN_SEPARATOR 0x3644e515` | `0xbedfba06…64d1c` → **exists** ✓ |
| x402 canonical `0x4020…4200` on 80094 | `eth_getCode` | `0x` — **absent** ✓ |

**Consequence for v0:** the gasless repayment rail (EIP-3009 `receiveWithAuthorization`) is real and
usable *today*. The x402 canonical settlement contract is **not deployed on Berachain**, so v0 must
not depend on it — evidence is verified from **ERC-20 Transfer logs**, not from an x402 contract.

---

## 1. Capability audit

Classification vocabulary: **implemented/tested** (real behaviour, real assertions, verified running)
· **unvalidated** (code exists, behaviour never proven) · **scaffold-only** (contract/stub, no impl)
· **reusable** (adopt as-is or near-as-is) · **incompatible** (wrong domain/model; do not force)
· **deferred** (real, but not needed for v0).

### 1.1 Verdicts

| Repo @ SHA | Verdict | Basis (verified, not read) |
|---|---|---|
| **loa-arcturus** `f143cdb` | **implemented/tested (mock path only) + unvalidated (live path)** — EXTRACT kernel | I reproduced the full acceptance run locally: migrations `0001→0005` apply clean on `postgres:16`; `pnpm seed:bepolia` wrote 6 settlements *through the real `settle()`*; `pnpm verify` exited **0** with A✓ B✓ D✓ and honestly reported C as TESTER-REQUIRED; re-seed idempotent (0 new / 6 present); `pnpm test` **10/10**. **But `pnpm typecheck` FAILS** (§1.3 F-1) and no real tx has ever been scored. |
| **loa-hounfour** `e24752e2` | **implemented/tested + reusable** — PROTOCOL SUBSTRATE | 264 schema files (241 top-level + 21 commons), 141 constraint files, **1,369 vector files**. Constraint DSL has first-class `bigint_sum` (`src/constraints/evaluator.ts:157`, `grammar.ts:166-167`) and `bigint_coercible` type signatures (`constraint-types.ts:20,31`). **I scanned all 264 schemas: ZERO `type: number` money fields.** Money convention is `*_micro` **string**. RFC-8785 JCS + ES256/EdDSA-only JWS (`src/utilities/signature.ts:23`, rejects RS256/HS256). |
| **billing-api** `7903cf9a` | **implemented/tested + reusable** — THE FACILITY LEDGER | `bun test` → **30 pass / 0 fail / 92 expects**, verified by me. Append-only double-entry (`credit_lots`/`lot_entries`), BigInt micro-USD with a *canonical-form regex* rejecting floats/signs/leading zeros (`packages/protocol/src/ids.ts:34-37`), `overspend` as an honest debit-class lot-less entry (`0005_overspend_entries.sql`), SECURITY DEFINER insert fn, RLS + FORCE RLS, and the no-op-conflict conservation fix (`ledger-math.ts:65-73`). Idempotency key read from **verified JWT claim, never the body** (`ids.ts:16-24`). |
| **identity-api** `bca4412c` | **implemented/tested + reusable (auth) / deferred (entity)** | 14 tables; 2-of-3 production operator approval enforced *in SQL* (`0004_operator_grants.up.sql:95-123` incl. no-self-approval + array-uniqueness). ES256 svc-JWT + JWKS + fail-closed denylist. **No legal entity / organization / obligor / KYB anywhere** — doctrinally excluded (`0001_init_spine.up.sql:16-18`). `audit_events` is append-only **by code discipline only — no DB rule, no hash chain** (`0001:104-109`). |
| **loa-finn** `69f3f8a7` | **implemented/tested (x402 verifier) + unvalidated (sybil edges) → EXTRACT** | **The single most valuable asset for v0.** `src/x402/receipt-verifier.ts` is a real 7-step fail-closed verifier: receipt status, confirmation depth, **strict Transfer-log match (emitter == token, `to` == recipient, exact amount, and *exactly one* match or reject)**, true payer taken from the **log's `from`, not `tx.from`** (`:317-373`) — correct for smart-accounts/relayers — then atomic Redis nonce consume. I ran its tests: **21 pass / 0 fail**. Also **unique in the ecosystem**: `src/score/core/leaderboard.ts:53` flags agent-to-agent revenue as circular/wash. **Caveats:** mounted at `src/gateway/server.ts:580` but flag-gated off; `CHAIN_CONFIGS` is **Base/USDC-only** (`src/x402/types.ts:130-143`); the sybil layer has **no data source** (`src/score/edge/adapters.ts:22,36` both `throw new NotImplementedError`); and its credit store round-trips BigInt→`Number` across all five balance columns (`src/credits/pg-credit-store.ts:53-57`) — do **not** adopt finn's credit ledger. |
| **loa-freeside** `8e616437` | **reusable (lot ledger) / unvalidated (x402 — proven never executed)** | Origin of arcturus's copies. Its lot ledger is best-in-class: earliest-expiry-first `debitLots` with deterministic `FOR UPDATE` lock order, 4 independent idempotency layers, append-only triggers, `REVOKE INSERT` + SECURITY DEFINER write funnel. **But its `x402-settlement.ts` is orphaned (zero importers in 2,206 TS files) and demonstrably never ran** — I verified two independent schema errors still live at HEAD: `:155` inserts `webhook_events.event_type`, a column the table **does not have** (`0010_webhook_events_crypto_payments.sql:24-33`), and `:231` uses `RETURNING id` where the PK is `event_id` (`0011_usage_events_pg.sql:22`). Two column errors in one function cannot survive a single live execution. Arcturus **found and fixed both** — real value added. `@0xhoneyjar/events` Ed25519 + hash-chain envelope exists but is **not imported anywhere in the money path**. |
| **sonar-api** `b3209fd8` | **implemented/tested (as an NFT indexer) but incompatible for v0 evidence → deferred** | Genuinely live (6 Railway services; Berachain 80094 is its *primary* chain, `config.yaml:752-756`). But: **`as_of_block` is a dead field** — declared at `src/kitchen/ownership-snapshot.ts:43`, hardcoded `?? null` at `:186,:211`, and no caller ever passes it, so every snapshot response returns `as_of_block: null` and `as_of` is wall-clock (`Date.UTC(y,m-1,d,23,59,59)`, `:144`). `rollback_on_reorg` is **unset on both production configs** while being set explicitly on non-prod ones (`config.robinhood-sidecar.yaml:14`). The 20k-line `src/truth-contract/` finality subsystem is **unwired** (zero imports from `src/kitchen/routes.ts` or `src/EventHandlers.ts`) and self-stamps `NO_PRODUCTION_AUTHORITY` (`reconciliation.ts:1953`). ERC-20 is a **7-address allowlist** that silently drops unknown tokens (`src/handlers/tracked-erc20.ts:27-31`); **HONEY is not among them**; `TokenStandard` has **no `erc20` member** (`src/kitchen/types.ts:8`); zero x402 support. **No Bepolia (80069) anywhere.** |
| **score-api** `61773656` | **implemented/tested but incompatible (as credit input) / reusable (audit substrate)** | Genuinely excellent determinism machinery (clock-free engine, typed `asOf` replay with *honest refusals*, CPython bit-parity `fsum`/`pyRound`). But it scores a **wallet inside one NFT community**, self-describes as *"a receipt for past behavior, not a prediction"*, explicitly disclaims eligibility use, and **discards economic magnitude** by design (price enters only as a percentile). Its live `conviction` config carries **no version/digest**. Do not use as an underwriting feature. |
| **loa-dixie** `d36c0846` | **deferred** | Reputation math (EMA/Bayesian/decay) is the right machinery for *maturing* repayment history — after repayment history exists. |
| **ledger-api** `1a1a95e8` | **scaffold-only → REJECT for money path** | Self-declares `**Status: scaffolded (not built).**` in its own README; in-memory stub; "signed mutation" is prose with no signature verification. billing-api is the ledger. |
| **loa** `d75f5b60` | **reusable as dev substrate only** | Dev framework v1.196.0. Not a runtime service. Graduated-trust is dormant bash gating *agent* autonomy — inspire credit tiers, implement in Postgres/hounfour, do not repurpose the bash lib. |

### 1.2 Cross-cutting capability matrix

| Capability | Status | Verified evidence |
|---|---|---|
| **Money precision** | **STRONG in contracts, BROKEN in arcturus scoring** | hounfour: 0/264 schemas use float money. billing-api: `MicroString` regex `^(0\|[1-9][0-9]*)$`. **arcturus violates it** — see F-2. |
| **x402 / replay** | **PARTIAL** | Two real DB-level guards verified live by me: `UNIQUE(chain_id,tx_hash)` rejected a duplicate insert; append-only trigger rejected `UPDATE`. But nonce handling in the route is broken (F-3) and the payer is **client-asserted, never chain-verified** (F-4). |
| **Affiliate detection** | **MECHANISM REAL, INPUT EMPTY** | Filter 1 logic is correct and tested (`oracle.test.ts:70-101`), but the allowlist defaults to deliberately-unmatchable sentinels (`src/oracle/config.ts:49-58`) → **production no-op** until populated. |
| **Circular-flow detection** | **implemented/tested (on synthetic data)** | `funding-graph.ts:141-176` forward-reach ∩ ancestors. Correct algorithm; only ever run against `synthetic-graph.ts`. |
| **Identity** | **wallet↔human YES; economic obligor NO** | identity-api has no entity concept; hounfour `agent-identity` has delegation but no legal obligor. **Wallet identity ≠ economic identity is unimplemented anywhere.** |
| **Accounting** | **STRONG (billing-api) / ABSENT (facility)** | Double-entry + overspend + conservation exist. Commitment/availability/draw/charge/repayment/delinquency/write-off/recovery/reserve/loss **do not exist in any repo**. |
| **Events** | **PRIMITIVES EXIST, UNUSED IN MONEY PATH** | `commitment-root.schema.json` (`subject_hash` = SHA-256 of canonicalized artifact), `assertion.schema.json` (8-variant signed-observation union), `audit-trail-entry.schema.json`. freeside's Ed25519 envelope not wired to money. |
| **Sonar** | **deferred** | No Bepolia; reindex cost real. |
| **Reconciliation** | **ABSENT** | billing-api explicitly defers reconciliation jobs to future cycles (`CLAUDE.md:80-83`). arcturus's Redis adjustment is best-effort with a bare `catch {}` (`x402-settlement.ts:335-337`) and *no* sweep exists to catch up. |
| **Upgrades** | **STRONG** | hounfour: `additionalProperties: false` everywhere + N/N-1 + strip-then-validate consumer pattern (`SCHEMA-EVOLUTION.md`), semver/vector/constraint/dist-parity CI gates. |

### 1.3 Defects I proved (not inferred) — these gate v0

**F-1 · `pnpm typecheck` fails on `main`.** Reproduced:
```
src/adapters/chain/dune-sim-client.ts(59,8): TS2307: Cannot find module './dune-sim-types.js'
src/adapters/chain/hybrid-provider.ts(47,40): TS2307: Cannot find module './native-reader.js'
src/adapters/chain/provider-factory.ts(40,8): TS2307: Cannot find module './config.js'
src/routes/x402.routes.ts(235,9): TS2322: 'string | string[]' not assignable to 'string'
```
→ The **Dune and RPC provider paths do not compile.** Only the mock path is executable. Therefore
the funding graph (Filter 3) can never run on real chain data at this SHA. Severity: **blocks v0**.

**F-2 · BigInt→Number in the economic path.** `src/oracle/oracle.ts:222`
`Number(qualified)/Number(raw)` and `:208` `BigInt(Math.floor(Number(actual_micro) * ageWeight * originMultiplier))`.
Proved numerically:
```
raw=10000000000000000  qualified=9999999999999999  (1 micro short)
code score = 1          → reported as a PERFECT score
actual=9007199254740993 → weighted=9007199254740992 (drift -1)
```
→ At ≥ ~$9.007B a shortfall silently reports as perfect. Violates the stated rule "no BigInt-to-Number
in economic paths". Severity: **must fix before any decision cites the score**.

**F-3 · Nonce double-burn makes the payment path dead-on-arrival.** `x402.routes.ts:253` calls
`verifyNonceUnique(pool, …)` which **commits** the nonce (autocommit), then `settle()` re-checks the
same nonce *inside* its transaction (`x402-settlement.ts:238`) → `ON CONFLICT DO NOTHING` → 0 rows →
throws `x402 nonce replay detected`. Proved against live Postgres:
```
route pre-check verifyNonceUnique -> true   (nonce now COMMITTED)
settle() in-tx  verifyNonceUnique -> false
DEFECT: settle() throws "nonce replay detected" for a FIRST-TIME payment
```
→ **Every first-time payment would be rejected.** Masked only because `createX402Router` is never
mounted (grep: zero importers; no server entrypoint exists). Severity: **blocks any mounted rail**.

**F-4 · Evidence is client-asserted.** `x402.routes.ts:229-237` builds the proof — `tx_hash`,
`chain_id`, `from`, `amount_micro` — purely from a client JSON header, with **no `eth_getTransactionReceipt`,
no Transfer-log match, no amount check**. `settle()` then persists it as truth. A payer could
self-report arbitrary revenue. Severity: **fatal for underwriting; this is the core v0 build item.**

**F-5 · RLS stripped from arcturus copies.** Deliberate single-tenant PoC decision
(`migrations/0005_x402_settlements.sql:47-50`), but billing-api's equivalents **keep** RLS +
FORCE RLS. Any multi-obligor deployment needs tenant isolation restored. Severity: **blocks
multi-obligor** (v0 has ≥3).

**F-6 · No reconciliation, and a silent-failure Redis path.** `x402-settlement.ts:335-337` swallows
all Redis errors with the comment *"reconciliation sweep will catch up"* — **no such sweep exists in
any repo.** Severity: high (this is why v0 mandates an outbox, §4.7).

### 1.4 What is genuinely strong (adopt, don't rebuild)

1. **Determinism-as-product.** `asOf` threaded through the whole scoring path, never `Date.now()`;
   byte-identical replay asserted (`oracle.test.ts:163-179`) and reproduced by me across processes.
2. **Anti-self-grading.** The oracle reports **0.20** for the affiliated service — it is structurally
   willing to publish ≈$0 for its own operator. Verified in my run.
3. **Honest red.** `pnpm verify` reports Assertion C as `TESTER-REQUIRED` rather than faking green.
   This is the single most valuable cultural property in the codebase; v0 must preserve it.
4. **billing-api's overspend primitive.** Post-compute finalize *represents* overspend instead of
   rejecting it — precisely the shape a drawn-but-unrepaid facility needs.
5. **hounfour's `bigint_sum` constraint DSL** — machine-checked conservation, at the contract layer.

### 1.5 Sources that conflict → authority rulings

| Conflict | Ruling |
|---|---|
| arcturus `README`/`NOTES.md` "PoC COMPLETE" vs `pnpm typecheck` failing | **Code is authoritative.** "Complete" = *mock-mode* complete. `NOTES.md` itself concedes this ("whole-project `tsc`/`test` redness … pre-existing copied adapters"). Ruling: mock-complete, live-unproven. |
| `ledger-api` README "event-sourced signed-mutation ledger" vs code | **Code authoritative** — README also self-declares `scaffolded (not built)`. Not the money path. |
| `09-decision-architecture.md` "234 schemas" vs my count | **My count authoritative: 264 files** (241 top-level `*.schema.json` + 21 commons + 2 others). Minor. |
| `09-decision-architecture.md` "arcturus @ `9313716`" vs the goal's `f143cdb` | **`f143cdb` authoritative** (current default-branch HEAD; `9313716` is its parent). The doc pinned the parent because it *is* the commit that added the doc. No material difference: `f143cdb` changed only `.claude/` + `grimoires/`, zero `src/` changes (verified via `git show --stat`). |
| `09` claims "net-new schemas: FacilityAgreement …" implying no credit schemas exist | **MODIFIED.** hounfour already ships `mutual-credit.schema.json`, `credit-note.schema.json`, `dispute-record.schema.json` + their constraint files. They are the wrong shape for a facility (see §1.6 C-9) but they establish binding precedent for naming/money conventions, and `DisputeRecord` is **directly reusable**. |
| score-api as an underwriting input | **Its own code is authoritative against it**: `quality-bands.ts:4-7` states the band is *not* an eligibility verdict; `goalRegistry.ts:76-77` states it is *not* a prediction. Excluded from v0. |

### 1.6 Classification of every major claim in `09-decision-architecture.md`

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| C-1 | arcturus filters real but **all chain data mocked**; no real tx ever scored | **CONFIRMED** | Reproduced: mock-only run; F-1 proves dune/rpc don't compile. |
| C-2 | Filter 1 is a **production no-op** (placeholder allowlist) | **CONFIRMED** | `config.ts:49-58` sentinels; `resolveAffiliateAllowlist` falls back to them. |
| C-3 | Dormant **double-nonce bug** if routes ever mount | **CONFIRMED and escalated** | I proved it against live PG. It is not merely "dormant": if mounted, **100% of first-time payments fail**. Escalate to blocker. |
| C-4 | `Number()` **precision ceiling** in confidence diagnostic | **CONFIRMED and widened** | The ceiling also hits the **headline score** (`:222`), not just the diagnostic. Proved a false perfect 1.0. |
| C-5 | billing-api `overspend` = honest bounded post-paid exposure; **no payment rails** | **CONFIRMED** | `Ledger.ts:41-62`; `CLAUDE.md:80-83` defers rails. 30/30 tests pass. |
| C-6 | ledger-api is **contract skeleton only**, no signature verification | **CONFIRMED** | Its README self-declares it. |
| C-7 | **HONEY is EIP-3009 + EIP-2612 native**, 18 decimals, pausable proxy | **CONFIRMED** (independently, on-chain today) | `authorizationState` + `DOMAIN_SEPARATOR` both answer; `decimals()=0x12`. The doc's own warning about the `micro-USDC == micro-USD` weld is therefore **load-bearing**: HONEY is 18-dec, the ledger is 6-dec micro. |
| C-8 | Canonical x402 `0x4020…` **absent on 80094** | **CONFIRMED** (re-verified today, `eth_getCode = 0x`) | v0 must verify Transfer logs, not an x402 contract. |
| C-9 | identity-api has **no agent/obligor entity**; obligor model is net-new | **CONFIRMED** | 14 tables, none entity-shaped; exclusion is doctrinal. |
| C-10 | hounfour = reusable protocol substrate w/ bigint conservation + byte-identity vectors | **CONFIRMED** | 1,369 vectors; `bigint_sum` in the DSL; 0/264 float money fields. |
| C-11 | score-api **domain-mismatched** for credit | **CONFIRMED** | Its own code disclaims prediction and eligibility. |
| C-12 | sonar-api **no Bepolia / no PoL-core**; defer | **CONFIRMED** | Kept deferred in v0 for a stronger reason: direct log reads are *more* auditable at N≤5. |
| C-13 | **No lending primitives in any of the 11 repos** | **CONFIRMED** | Nearest are `mutual-credit` (peer credit line, no draw/repayment schedule/default) and `credit-note` (a refund). No facility, draw, amortization, delinquency, or write-off anywhere. |
| C-14 | Reject: emissions faucet / Bend fork / Dolomite dependency / public pool / pure oracle | **CONFIRMED (reasoning sound, and independent of unstable inputs)** | These rejections rest on repo facts (zero lending primitives; oracle never run live), which I verified, not on BERA spot price. Adopted. |
| C-15 | MVE: $10k cap, 3–5 external obligors, 12 weeks, planted forger | **CONFIRMED as sound design; MODIFIED in v0** | v0 narrows to **Form 2 only** (revenue advance). Form 1 (deferred settlement) is explicitly out of scope per the v0 boundary. |
| C-16 | ERA repayment has **zero protocol enforcement**; DES `debt` is an emission counter | **UNVERIFIABLE from repos** (off-repo claim; forum/docs-sourced) | Not load-bearing for v0 — Lane A is deferred and quarantined either way. Do not build on it. |
| C-17 | Market figures (BERA $0.1726, TVL $50.9M, emissions $3.55M/yr, x402 ~$0 on Bera) | **UNVERIFIABLE / time-decaying** | Re-verify before any Lane-A decision. **v0 does not depend on any of these**, which is a design goal: the experiment must not be falsified or vindicated by a price move. |
| C-18 | "the missing 10% is small and cheap" | **MODIFIED — optimistic** | The missing pieces are small in *schema* terms but include the two hardest correctness items: **chain-verified evidence** (F-4) and **cross-service consistency** (F-6, no outbox anywhere). Budget for those, not for CRUD. |
| C-19 | freeside `@0xhoneyjar/events` Ed25519 envelope exists but is **not in the money path** | **CONFIRMED** | Discipline designed, adoption unfinished. v0 wires it (§4.2). |
| C-20 | Obligor = CONTROLLER × APPLICATION, never wallets/instances | **CONFIRMED as the correct model; adopted verbatim** | This is the one design decision that most directly satisfies "wallet identity is not economic identity". |

**Net assessment of `09`:** its capability verdicts are accurate and its product rejections are
well-grounded. Three corrections matter for building: C-3 and C-4 are **more severe** than recorded,
and C-18 **understates** the remaining work. Nothing in it needs to be rejected.

---

## 2. Exact scope of v0

One product, chosen per the v0 boundary: **an operator-funded advance to a metered digital-service
provider, repaid from later qualified external receipts.** Every choice below is singular and final
for v0; the alternatives are listed as non-goals so they cannot creep in.

### 2.1 The seven decisions

| Dimension | **v0 decision** | Why this and not the alternative |
|---|---|---|
| **Workload** | **One HTTP API/inference endpoint per provider, priced per request, settled per request.** The provider is the *seller*; its buyers are arms-length third parties. | Per-request metering is the only workload where "work happened" and "payment happened" are the same observable event. Subscription/seat billing has no per-unit receipt to qualify. |
| **Chain path** | **Berachain mainnet 80094 only.** Evidence = **ERC-20 `Transfer` logs of HONEY** (`0xFCBD…0Dce`, 18 dec) read from `eth_getTransactionReceipt` + `eth_getLogs`, at a **confirmation depth of 32 blocks** (~64 s at the measured 2 s block time). No Bepolia. No Base. No x402 contract. | x402 canonical contracts are **absent on 80094** (verified `eth_getCode = 0x`), so log-verification is the *only* available truth. Bepolia is dropped because a testnet receipt is not revenue. Base is dropped because v0 must test the Berachain-attached claim, not evade it. **Consequence to accept up front:** real HONEY-denominated x402 volume on 80094 is ~nil today, so v0's evidence must be *originated* by the pilot itself (§8.4). |
| **Evidence format** | **`EvidenceBundle`** — a signed, content-addressed JSON document: `{methodology_id, as_of_block, as_of_block_hash, receipts[], commitment}` where each receipt is `{chain_id, tx_hash, log_index, token, from, to, amount_atoms, block_number, block_hash, confirmations}`. Canonicalized RFC-8785, SHA-256'd into a `commitment-root`, Ed25519-signed. **Private body, public commitment.** | Pinning `as_of_block` **and** `as_of_block_hash` is what makes replay honest under reorgs — the exact thing sonar's dead `as_of_block` field fails to provide. `log_index` is in the identity because a single tx can carry several Transfers. |
| **Operator** | **A single legal entity ("the Operator") holding a 2-of-3 multisig HONEY treasury** on 80094, with the disburse key **never** held by any service process. | Mirrors identity-api's SQL-enforced 2-of-3 discipline (`0004_operator_grants.up.sql:95-123`), which is the only human-authorization primitive in the stack that already exists and is tested. |
| **Advance asset** | **HONEY** (18 decimals), transferred from the Operator treasury to the obligor's registered disbursement wallet. | HONEY is verifiably EIP-3009 + EIP-2612 native today (re-verified on-chain) and is the Berachain-attachment mechanism. |
| **Repayment asset** | **HONEY**, collected via **EIP-3009 `receiveWithAuthorization`** (gasless, pull-based, obligor pre-signs an authorization per instalment). | Pull-based collection is the only model where the Operator can execute a scheduled repayment without the obligor having to remember to push. `authorizationState` verified live. Each authorization has a unique `nonce` → **on-chain replay protection for free**. |
| **Qualified revenue** | Trailing-**28-day** window of HONEY receipts to the provider's registered receiving wallet from payers passing **binary gates: affiliate-exclusion, dust-floor, circular-flow**, computed at a pinned `as_of_block`. Diagnostics (wallet-age, external-origin) are published but **never** enter the qualifying sum. | Adopts arcturus's proven `oracle.ts` gate structure and its OPEN-5 reconciliation verbatim — the headline must stay reproducible from binary rules alone. |

### 2.2 The v0 loop (the seven required steps, mapped to owners)

| # | Step | Component | Authorizing actor |
|---|---|---|---|
| 1 | Register legal/economic obligor + delegated agent/application | `arcturus-credit` (net-new) + identity-api SIWE | Operator (admits obligor); obligor self-serves wallet proof |
| 2 | Verify metered work and payment | finn `receipt-verifier` (extracted, re-pointed at HONEY/80094) | Machine, fail-closed |
| 3 | Qualify arms-length revenue deterministically | arcturus oracle (fixed per F-2, real provider) | Machine, deterministic + replayable |
| 4 | Assign a bounded limit | `arcturus-credit` policy engine — pure function, versioned | Machine computes; **Operator 2-of-3 signs** |
| 5 | Record one operator-funded HONEY draw | Facility ledger + on-chain transfer | **Operator 2-of-3** only |
| 6 | Route partial and final repayment from later receipts | Repayment engine (EIP-3009 collection) | Machine executes a pre-authorized schedule |
| 7 | Publish a replayable Return Ledger | Epoch sealer | Machine; publicly verifiable |

**Constitutional rule, enforced structurally:** *no LLM output may authorize capital.* Implementation:
the `draw` command requires a `policy_decision_id` whose row carries `decided_by = 'rule'`, a
`methodology_id`, an `evidence_commitment`, and **two distinct operator signatures**. There is no code
path from any model output to a `draw`. An LLM may write a memo attached to the facility record for
human reading; that column is never read by the authorization check (§6.4).

### 2.3 Non-goals for v0 (explicit, so they cannot creep)

**Out of scope entirely:** buyer deferred settlement (Form 1) · public/lender-funded pools · Reward
Vault or any PoL emission integration · Bend · Dolomite · vault tokens or any transferable claim ·
secondary trading of facilities · any Solidity deployment · sonar-api integration · score-api
conviction as an underwriting feature · dixie reputation scoring · ledger-api · multi-chain evidence ·
Bepolia · fiat rails · KYC/KYB vendor integration · automated collections/legal recovery · dispute
adjudication beyond a manual runbook + a recorded `DisputeRecord` · marketplace sub-attribution ·
agent-to-agent credit · interest accrual more complex than a flat fee schedule.

**Retained as future seams (design so they attach later without re-architecture):** the facility
ledger carries a zero-filled `tranche` dimension (Lane-D-ready) and a `lane` partition (Lane-A
quarantine-ready); `EvidenceBundle.receipts[].chain_id` is not constrained to 80094 in the schema, only
in the v0 policy; repayment carries an `asset` field so a non-HONEY rail is a config change.

### 2.4 What "falsify" concretely means

v0 is a success **as an experiment** if it produces any of these observations, and each is designed
to be reachable within one 12-week program:

| Falsifier | Concrete v0 observation that kills it |
|---|---|
| **F1 Demand** | ≥20 qualified offers made at real pricing → **0** signed facilities in 8 weeks |
| **F2 Evidence integrity** | The planted forger obtains **any** non-zero limit, **or** measured forgery cost < 2× the limit it could obtain |
| **F3 Unit economics** | Realized losses + servicing cost > fee income across the cohort at the $10k cap |
| **F4 Identity value** | History-based limits show no loss-predictive lift vs. "size on raw revenue" after ≥8 obligor-cycles |
| **F5 Berachain attachment** | ≥50% of repayment attempts fail or migrate off the HONEY rail for friction reasons |

**Note on F4's honesty:** at 3–5 obligors, F4 is **not statistically testable**. v0 validates
*mechanics* — that the loop closes, replays, and conserves — and produces the first data points. Any
claim of predictive lift from a 5-obligor pilot would be exactly the self-grading this project exists
to refuse. This is stated in §8.1 as a hard reporting constraint.

---

## 3. System context — three separated systems

### 3.1 The separation

| | **Loa-Arcturus Protocol** | **Canonical Network** | **Operator** |
|---|---|---|---|
| **Is** | Schemas, invariants, conformance vectors, methodology definitions | The operated deployment that computes truth | The legal entity that owns capital and risk |
| **Holds** | Nothing (no funds, no data, no keys) | Evidence, ledgers, computed decisions | Keys, capital, the loan book, legal obligations |
| **Can** | Be implemented by anyone | Be forked and re-run by anyone from a snapshot | Change risk policy |
| **Cannot** | Be changed unilaterally by the Operator (versioned, vector-gated) | Change what the methodology says a number is | Change what the Network computed, retroactively |
| **Lives in** | `loa-hounfour` (npm `@0xhoneyjar/loa-hounfour`) | `arcturus-credit` + finn + billing-api + identity-api | Off-chain legal + 2-of-3 multisig |
| **Fails how** | A bad schema breaks CI, not money | A wrong number is *detectably* wrong via replay | An insolvent Operator loses **its own** capital first |

### 3.2 Trust boundaries

```
┌── BOUNDARY 1: UNTRUSTED PUBLIC ────────────────────────────────────────────┐
│  Buyers/payers · the provider's own claims · any client-supplied header    │
│  RULE: nothing here is evidence. A claim becomes evidence only after       │
│  chain verification (BOUNDARY 2). This is the fix for defect F-4.          │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  claimed tx_hash (a HINT, not a fact)
┌── BOUNDARY 2: CHAIN ──────────▼────────────────────────────────────────────┐
│  Berachain 80094. Truth source for: payment occurrence, payer identity,    │
│  amount, block/finality. Read via ≥2 independent RPC endpoints; a receipt  │
│  is accepted only on agreement. Depth ≥32 blocks.                          │
│  TRUST: high, but reorg-fallible → every fact is pinned to (block, hash).  │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  VerifiedReceipt (fail-closed, exactly-one-match)
┌── BOUNDARY 3: NETWORK (deterministic, no discretion) ─────────────────────┐
│  Evidence store (private) · oracle (pure) · policy engine (pure) ·         │
│  facility ledger (append-only) · epoch sealer                              │
│  RULE: given (evidence snapshot, methodology_id) → byte-identical output.  │
│  No wall clock, no network reads, no LLM, in any scoring/policy path.      │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  PolicyDecision (a RECOMMENDATION, bounded)
┌── BOUNDARY 4: OPERATOR (discretion + keys) ───────────────────────────────┐
│  2-of-3 human signers. May DECLINE or REDUCE any recommendation.           │
│  May NEVER increase a limit above the rule's output, and may never         │
│  authorize without a valid (policy_decision_id, evidence_commitment).      │
│  Holds the only keys that move HONEY.                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Asymmetry that makes this safe:** the Network can only ever *lower* risk by being wrong-conservative;
the Operator can only ever *lower* exposure relative to the rule. Neither can unilaterally raise it.
Raising a limit requires a methodology version bump, which is vector-gated in CI and publicly visible.

### 3.3 Sources of truth (single-writer per fact)

| Fact | Sole source of truth | Everyone else |
|---|---|---|
| Payment occurred / payer / amount | **Berachain 80094 logs** | caches, must be re-derivable |
| Which receipts are *qualified* | **oracle output at a pinned `(methodology_id, as_of_block)`** | may not re-filter |
| Human ↔ wallet linkage | **identity-api** (`users`, `wallet_links`) | reads only |
| Obligor legal identity + delegation | **`arcturus-credit.obligors`** (net-new; identity-api has no entity — C-9) | reads only |
| Facility state, balances, draws, repayments | **facility ledger (append-only double entry)** | reads only |
| Metered work/cost | **finn cost-atom JSONL** (fail-closed) | reads only |
| Authorization to move money | **`operator_authorizations`** (2 distinct signatures) | nothing else may authorize |

### 3.4 On-chain vs off-chain duties (v0 deploys zero contracts)

| Duty | Where | Rationale |
|---|---|---|
| Value transfer, payer identity, payment finality | **On-chain** | Only the chain can prove these |
| Repayment pull authorization | **On-chain** (EIP-3009 signed authorization; nonce = replay guard) | Obligor consent must be cryptographic, not a DB row |
| Underwriting, limits, schedules, accounting, evidence custody, sealing | **Off-chain** | No contract needed to test the credit thesis; deploying one adds audit cost and an immutable-bug risk for zero experimental power |
| Public verifiability of the Return Ledger | **Off-chain publication + on-chain-anchorable commitment** (`commitment-root.anchor_tx_hash` left null in v0) | The seam exists; anchoring is a later switch |

### 3.5 Event flow (happy path, one cycle)

```
provider serves request ──► buyer pays HONEY on 80094
                                     │
             (claimed tx_hash) ──────▼
   receipt.verification.requested ──► [verify: receipt+logs, ≥32 conf, 2 RPCs]
                                     │ fail-closed on: no match, >1 match,
                                     │ wrong to/amount/token, insufficient depth
                                     ▼
                        receipt.verified {payer, amount_atoms, block, hash}
                                     │
                                     ▼ (append to private evidence store)
   evidence.bundle.sealed {commitment, as_of_block, as_of_block_hash}
                                     │
                                     ▼
   revenue.qualified {methodology_id, qualified_atoms, per-gate breakdown}
                                     │
                                     ▼
   policy.decision.recorded {limit_atoms, inputs_hash, decided_by:'rule'}
                                     │
                                     ▼  ◄── 2-of-3 human signatures
   facility.draw.authorized ──► facility.draw.disbursed {onchain_tx}
                                     │
      (later receipts arrive) ───────▼
   repayment.collected {principal_atoms, fee_atoms, onchain_tx}
                                     │
                                     ▼
   returnledger.epoch.sealed {epoch, seal_hash, prev_seal_hash}
```

---

## 4. Hounfour additions — the minimum necessary

### 4.0 Conventions inherited (do not reinvent — all verified at `e24752e2`)

| Concern | Reuse exactly |
|---|---|
| Money | `MicroUSDUnsigned` (`^[0-9]+$`) from `src/vocabulary/currency.ts` for balances; direction via explicit debit/credit fields, **never** by sign (house style, per `escrow-entry`/`governed-credits`/`mutual-credit`) |
| Naming | `*_micro` (string) for USD amounts, `*_atoms` for token-native amounts (**new**, see 4.1), `*_bps` (integer 0–10000) |
| Splits | `{address, role, share_bps, amount_micro}` + the paired `bigint_sum(...,'share_bps')==10000` / `bigint_sum(...,'amount_micro')==total` constraints (from `BillingEntry`/`CommonsDividend`) |
| Hashing | `safeCanonicalize()` → NFC + RFC-8785 + 100KB cap → SHA-256 → `sha256:<64hex>` prefix. Never import `canonicalize` directly (lint RULE-5) |
| Signing | `SignatureEnvelopeSchema` + `ED25519_SIGNATURE_PATTERN` + `ED25519_PUBKEY_PATTERN`. Hounfour ships shape only — **never** verifies (ADR-010) |
| Hash chain | `commons/audit-entry.schema.json` (`entry_hash`/`previous_hash`/`hash_domain_tag`) + `chainBoundHash` + the `audit_trail_chain_valid` builtin |
| Timestamps | `ISO8601_UTC_PATTERN` (byte-stable, rejects offsets) — **not** `format: date-time` |
| Idempotency | `idempotency_key` field + `deriveIdempotencyKey()` (`src/integrity/idempotency.ts:36`) |
| Events | `domain-event.schema.json` envelope, `{aggregate}.{noun}.{verb}` type pattern, `DomainEventBatch` for the outbox |
| Sagas | embed `saga-context.schema.json`; model multi-step on `bridge-transfer-saga.schema.json` |
| Methodology pin | `policy-version.schema.json` + a `policy_version_id` FK (**this is the house convention — do not invent `methodology_version`**) |
| Disputes | `dispute-record.schema.json` **as-is** (it already carries `resolution.credit_note_id`) |
| Strictness | `additionalProperties: false` — mandatory for financial schemas, non-negotiable |

**Critical inheritance:** hounfour's `conservation-property-registry` already declares as protocol law —
with error codes — the three invariants this product needs, but **no schema instantiates any of them**:

| ID | Law | LTL | Error code |
|---|---|---|---|
| **I-3** | Receivable bounded by reserved | `G(lot.receivable <= lot.reserved)` | `RECEIVABLE_EXCEEDS_RESERVED` |
| **I-7** | Revenue rule total | `G(sum(revenue_rules.bps) == 10000)` | `REVENUE_RULES_NOT_100_PERCENT` |
| **I-13** | Treasury adequacy | `G(treasury.balance >= sum(obligations))` | `TREASURY_INADEQUATE` / `RECON_TREASURY_SHORTFALL` |

v0's facility schemas are the **first instantiation** of I-3 and I-13. This is a strong signal the
design is congruent with the protocol's own intent rather than bolted on.

### 4.1 The `TokenAmount` primitive (must be added first — it unblocks everything)

**Problem being fixed:** the entire stack welds "micro" to 6-decimal USD. **HONEY has 18 decimals**
(verified on-chain). Writing a HONEY amount into an `*_micro` field silently loses or inflates value by
10^12. `09-decision-architecture.md` flagged this; v0 fixes it at the type level.

```
TokenAmount  ($id: TokenAmount, additionalProperties: false)
  chain_id      integer, ≥1                         — 80094
  token_address string ^0x[a-fA-F0-9]{40}$ lowercase — HONEY 0xfcbd…0dce
  decimals      integer 0..36                        — 18
  amount_atoms  string ^[0-9]+$                      — smallest indivisible unit; the ONLY arithmetic field
  symbol        string, optional, DISPLAY ONLY, MUST NOT be used for identity or arithmetic
```
**Rules:** all arithmetic is on `amount_atoms` as BigInt. Two `TokenAmount`s are addable **iff**
`(chain_id, token_address, decimals)` are equal — a constraint, not a convention. Any USD-equivalent is
a *derived, separately-versioned* figure carrying its own `rate_source` + `rate_as_of_block`, never
substituted for the atoms.

### 4.2 New schemas (10) — with IDs, signers, idempotency, privacy, ordering

Notation: **ID** = identity/derivation · **S** = signer · **I** = idempotency key · **P** = privacy.

| # | Schema | Purpose & key fields | ID / S / I / P |
|---|---|---|---|
| 1 | **`Obligor`** | The economic identity credit attaches to. `obligor_id`, `legal_name`, `jurisdiction`, `entity_type∈{natural_person,company,unincorporated}`, `controller_ref` (identity-api `user_id`), `kyb_status∈{none,self_attested,verified}`, `kyb_evidence_commitment?`, `status∈{pending,active,suspended,closed}`, `admitted_at`, `policy_version_id`, `contract_version` | **ID** UUIDv4, Operator-assigned. **S** Operator. **I** `(jurisdiction, legal_name_normalized)` unique. **P** `legal_name`/`jurisdiction` are **private**; only `obligor_id` + bands are public. |
| 2 | **`DelegatedApplication`** | The metered app/agent acting for the obligor. `application_id`, `obligor_id`, `display_name`, `receiving_wallets[]{chain_id,address,proof_ref}`, `disbursement_wallet{chain_id,address}`, `agent_identity_ref?` (hounfour `agent-identity`), `status`, `delegated_at`, `revoked_at?` | **ID** UUIDv4. **S** obligor controller (SIWE) + Operator co-sign. **I** `(obligor_id, chain_id, address)` unique per active wallet. **P** wallet addresses public (they're on-chain anyway). |
| 3 | **`EvidenceBundle`** | The private receipt set + its public commitment. `bundle_id`, `application_id`, `as_of_block`, `as_of_block_hash`, `window_start_block`, `receipts[]{chain_id,tx_hash,log_index,token_address,decimals,from,to,amount_atoms,block_number,block_hash,confirmations}`, `body_hash`, `signatures[]` | **ID** `bundle_id = sha256(safeCanonicalize(body))` → **content-addressed** (same bytes ⇒ same id ⇒ natural dedup). **S** Network evidence-intake key (Ed25519). **I** the content hash itself. **P** **body PRIVATE** (payer addresses + amounts); publish only `body_hash` via `commitment-root`. |
| 4 | **`QualifiedRevenueAttestation`** | The oracle's signed, replayable output. `attestation_id`, `application_id`, `evidence_commitment` (→3), `policy_version_id`, `as_of_block`, `as_of_block_hash`, `window_days`, `raw_atoms`, `qualified_atoms`, `flagged_affiliated_atoms`, `dropped_dust_atoms`, `dropped_circular_atoms`, `payer_count`, `distinct_qualified_payers`, `gate_breakdown[]`, `diagnostics{}`, `signatures[]` | **ID** `sha256` of `(evidence_commitment, policy_version_id, as_of_block, as_of_block_hash)` — **so a re-run cannot produce a second id**. **S** Network oracle key. **I** the id. **P** aggregates publishable; per-payer detail private. |
| 5 | **`CreditPolicyDecision`** | The bounded machine recommendation. `decision_id`, `obligor_id`, `application_id`, `attestation_ref` (→4), `policy_version_id`, `inputs_hash`, `recommended_limit` (TokenAmount), `binding_constraint∈{advance_rate,absolute_cap,history_length,payer_diversity,forgery_cost_floor}`, `decided_by` **literal `'rule'`**, `decided_at`, `explanation[]{rule_id,input,output}` | **ID** `sha256(inputs_hash + policy_version_id)` — **same inputs + same policy ⇒ same decision_id**, making non-determinism *detectable*. **S** Network policy key. **I** the id. **P** public (this is the glass box). |
| 6 | **`FacilityAgreement`** | The terms. `facility_id`, `obligor_id`, `application_id`, `decision_ref` (→5), `commitment` (TokenAmount), `advance_rate_bps`, `origination_fee_bps`, `periodic_fee_bps`, `fee_period_days`, `term_weeks`, `repayment_split_bps`, `cure_window_days`, `default_after_days`, `state∈{offered,accepted,active,amortizing,repaid,defaulted,written_off,cancelled}`, `opened_at`, `matures_at`, `signatures[]` | **ID** UUIDv4. **S** **obligor signature + 2 distinct Operator signatures** (3 total, `minItems: 3`). **I** `(decision_ref)` unique — one facility per decision. **P** terms private; anonymized bands published. |
| 7 | **`FacilityDraw`** | One disbursement. `draw_id`, `facility_id`, `authorization_ref`, `amount` (TokenAmount), `onchain{chain_id,tx_hash,block_number,block_hash}`, `requested_at`, `settled_at?`, `state∈{authorized,submitted,confirmed,failed,compensated}` | **ID** UUIDv4 client-generated **before** submission (so a retry reuses it). **S** 2-of-3 Operator. **I** **`draw_id`** — the DB unique key; plus a *second* guard `UNIQUE(chain_id, tx_hash)`. **P** private body, public aggregate. |
| 8 | **`FacilityRepayment`** | One collection, allocated. `repayment_id`, `facility_id`, `source∈{qualified_receipt,direct_transfer,operator_writeoff_offset}`, `evidence_commitment?`, `gross` (TokenAmount), `allocation{fee_atoms, principal_atoms}`, `onchain{...,authorization_nonce}`, `collected_at`, `state∈{pending,confirmed,failed,reversed}` | **ID** UUIDv4. **S** Network collector key; the **EIP-3009 authorization is the obligor's consent**. **I** `authorization_nonce` (on-chain-enforced single use) **and** `repayment_id`. **P** private body. |
| 9 | **`FacilityDefaultRecord`** | Default → recovery lifecycle. `record_id`, `facility_id`, `declared_at`, `days_past_cure`, `outstanding_at_default` (TokenAmount), `recoveries[]{repayment_ref, amount}`, `write_off{amount, recognized_at}?`, `state∈{delinquent,defaulted,written_off,recovered,partially_recovered}` | **ID** UUIDv4. **S** 2-of-3 Operator (a write-off is a capital decision). **I** `(facility_id)` unique. **P** private; only cohort-level loss rates published. |
| 10 | **`ReturnLedgerEpochSeal`** | The public replay anchor. `epoch`, `epoch_start_block`, `epoch_end_block`, `epoch_end_block_hash`, `entry_count`, `entries_hash`, `account_totals[]{account, lane, tranche, debit_atoms, credit_atoms}`, `prev_seal_hash`, `seal_hash`, `policy_version_id`, `signatures[]` | **ID** `seal_hash = sha256(safeCanonicalize(body_without_seal_hash))`. **S** Network sealer key. **I** `epoch` unique + `prev_seal_hash` must equal prior `seal_hash` (**chain-linked**). **P** **PUBLIC** — the whole point. |

**Reused unchanged:** `dispute-record.schema.json`, `credit-note.schema.json` (for corrections),
`policy-version.schema.json`, `commitment-root.schema.json`, `signature-envelope.schema.json`,
`domain-event{,-batch}.schema.json`, `saga-context.schema.json`, `commons/audit-{trail,entry}`.

### 4.3 New event types (additive vocabulary, `{aggregate}.{noun}.{verb}`)

```
credit.obligor.admitted          credit.application.delegated
credit.evidence.sealed           credit.revenue.qualified
credit.decision.recorded         credit.facility.offered
credit.facility.accepted         credit.draw.authorized
credit.draw.confirmed            credit.draw.compensated
credit.repayment.collected       credit.repayment.reversed
credit.facility.delinquent       credit.facility.defaulted
credit.facility.written_off      credit.recovery.collected
credit.returnledger.epoch_sealed credit.dispute.filed
```

### 4.4 Ordering guarantees

| Scope | Guarantee | Mechanism |
|---|---|---|
| Per facility | **Total order** | `ledger_entries.sequence_number` — a per-facility monotonic BIGINT with `UNIQUE(facility_id, sequence_number)`, assigned inside the writing transaction |
| Per epoch | **Total order across facilities** | `(epoch, sequence_number)`; the seal fixes the set |
| Cross-service | **Causal only** (no global order) | `correlation_id` + `causation_id` on the envelope |
| Evidence | **Block order** | `(block_number, log_index)` — the chain's own order, not arrival time |

**Explicitly not guaranteed:** global cross-service total ordering. Every consumer must be
commutative or idempotent. Stated so nobody assumes it.

### 4.5 Retries

All commands are **idempotent by key** (§4.2 column I), so the retry policy is simply: retry on
transient, never on `409 Conflict`.

| Operation | Policy | Terminal condition |
|---|---|---|
| RPC read (receipt/logs) | 5 attempts, exp backoff 250ms→4s, ≥2 independent endpoints must agree | disagreement → **fail closed**, quarantine |
| Evidence seal | infinite (content-addressed ⇒ idempotent) | — |
| Oracle run | infinite (pure) | — |
| **On-chain draw submit** | **NEVER blind-retry.** Reconcile first: query by `draw_id`-derived nonce; only resubmit if provably not mined | ambiguous → **halt, human** |
| Repayment collection | 3 attempts/day, 5 days | then `delinquent` |
| Outbox publish | infinite with backoff | poison after 100 → alert |

### 4.6 Compensation (what "undo" means where nothing can be deleted)

Nothing is ever mutated or deleted. Compensation is always a **new, forward entry** referencing the
original — a reversal, never an erasure.

| Failure | Compensation | Ledger effect |
|---|---|---|
| Draw authorized, chain tx reverted | `credit.draw.compensated` | Reverse the `DRAW` pair; facility returns to `accepted`; availability restored |
| Draw confirmed but evidence later invalidated (reorg) | **Do NOT reverse the draw** (money did move). Emit a corrected attestation + a `CreditNote`-style adjustment; if the new limit < drawn, the excess becomes immediately-due | Draw stands; a `CORRECTION` entry records the shortfall |
| Repayment confirmed then reorged out | `credit.repayment.reversed` — a compensating pair, then re-collect | Principal restored; original entry stays visible |
| Wrong-amount posting found | `CORRECTION` entry pair citing `corrects_entry_id` + reason | Both rows visible forever |
| Evidence reorg (block hash mismatch at `as_of_block`) | Quarantine bundle; recompute at a new `as_of_block`; supersede the attestation | New attestation supersedes; old retained |

**Reorg rule:** an `EvidenceBundle` is invalid if `eth_getBlockByNumber(as_of_block).hash != as_of_block_hash`.
Every replay re-checks this, which is precisely the guarantee sonar's dead `as_of_block` cannot give.

### 4.7 The outbox / saga (net-new — verified absent from every repo)

**Transactional outbox** (single pattern, applied uniformly):
```sql
outbox_events(
  event_id UUID PK, aggregate_type TEXT, aggregate_id TEXT, type TEXT,
  payload JSONB, correlation_id UUID, causation_id UUID,
  created_at TIMESTAMPTZ, published_at TIMESTAMPTZ NULL, attempts INT DEFAULT 0
)
```
The domain write and its `outbox_events` INSERT happen in **one transaction**; a separate relay
publishes and stamps `published_at`. Consumers dedupe on `event_id`. This is the fix for F-6 — no
more "reconciliation will catch up" with no reconciler.

**The one saga in v0 — Disbursement** (modelled on `bridge-transfer-saga`):
```
1 reserve_availability   (ledger)  ⇄ compensate: release reservation
2 record_authorization   (2-of-3)  ⇄ compensate: mark authorization void
3 submit_onchain_transfer (chain)  ⇄ NO COMPENSATION — reconcile, never blind-retry
4 await_confirmation     (chain)   ⇄ compensate: reverse draw pair if provably not mined
5 post_draw_entries      (ledger)  ⇄ compensate: CORRECTION pair
```
Step 3 is the only irreversible step and it comes **after** all reversible ones — the standard
"do the risky thing last" saga ordering. Timeout 30 min per step; on ambiguity the saga **halts for a
human** rather than guessing (fail-closed, not fail-forward).

**Three reconcilers** (cron, idempotent, every run emits a signed report):
1. **Chain↔ledger:** every `confirmed` draw/repayment has a real, still-canonical tx at that block hash.
2. **Treasury↔book (I-13):** on-chain treasury balance ≥ Σ outstanding commitments − Σ drawn.
3. **Outbox drain:** no `published_at IS NULL` older than 5 minutes.

---

## 5. The facility ledger

### 5.1 Decision: **a separate ledger inside `arcturus-credit`, reusing billing-api's proven patterns — not an extension of billing-api**

| Criterion | Extend billing-api | **Separate (chosen)** |
|---|---|---|
| Domain fit | `credit_lots`/`lot_entries` model *prepaid consumption*: a lot is funding to be spent down. A facility is the **inverse** — value advanced that must come **back**. `overspend` is the nearest shape but has no cap, schedule, cure, or counterparty. | Purpose-built for commitment→draw→repay→default. |
| Money type | Hard-wired 6-dec micro-USD (`MicroString` regex). HONEY is 18-dec. Changing it is a **breaking change to a live producer contract** finn depends on (`contract_version 8.3.0`; finn FATALs at boot on mismatch). | `TokenAmount` from day one; no live consumer to break. |
| Blast radius | A credit-experiment bug could break live metered billing. | Isolated. A v0 failure cannot take down billing. |
| Tenancy | Uses `community_id` as the tenant axis; our tenant is an **obligor** (legal entity). | Native `obligor_id` + RLS. |
| Independent variable | The experiment's whole point is that it may be **deleted**. Deleting tables from billing-api is far worse than dropping a separate schema. | Cleanly disposable. |

**What is copied verbatim (the proven parts):** append-only BEFORE UPDATE/DELETE triggers · SECURITY
DEFINER insert function as the sole write path · RLS + FORCE RLS (**restoring what arcturus stripped**,
F-5) · partial unique indexes as idempotency anchors · the `planSettlement` / `accountForDebitStep`
no-op-conflict discipline (`ledger-math.ts:65-73`) · balance-from-entry-class-sums (never a stored
authoritative balance) · idempotency key from a **verified claim, never the request body**.

### 5.2 The twelve distinguished concepts (each is a distinct account, not a flag)

| # | Concept | Meaning | Account (DR/CR) |
|---|---|---|---|
| 1 | **Commitment** | Maximum the Operator has agreed to make available. A *promise*, no cash moved. | `COMMITMENT_GRANTED` (memo pair) |
| 2 | **Availability** | Commitment − drawn + repaid principal. Derived, never stored. | derived |
| 3 | **Draw** | Cash actually disbursed on-chain. | DR `PRINCIPAL_OUTSTANDING` / CR `TREASURY_HONEY` |
| 4 | **Principal** | Drawn and not yet repaid. | `PRINCIPAL_OUTSTANDING` |
| 5 | **Charge** | Fees assessed (origination, periodic, late) — accrued, distinct from collected. | DR `FEES_RECEIVABLE` / CR `FEES_EARNED` |
| 6 | **Repayment** | Cash in, allocated by waterfall. | DR `TREASURY_HONEY` / CR `FEES_RECEIVABLE` then `PRINCIPAL_OUTSTANDING` |
| 7 | **Revenue share** | Any share-of-receipts component (v0: 0 bps, present so Lane-D needs no migration). | `REVENUE_SHARE_{ACCRUED,COLLECTED}` |
| 8 | **Delinquency** | Past due, inside the cure window. A **state**, not a loss. | `PRINCIPAL_DELINQUENT` (reclass from outstanding) |
| 9 | **Write-off** | Recognition that principal will not return. | DR `REALIZED_LOSS` / CR `PRINCIPAL_DELINQUENT` |
| 10 | **Recovery** | Cash after write-off. | DR `TREASURY_HONEY` / CR `RECOVERIES` (**never** un-writes-off) |
| 11 | **Reserve** | Forward-looking expected-loss provision. Contra-asset; **never** nets against realized loss. | DR `PROVISION_EXPENSE` / CR `LOSS_RESERVE` |
| 12 | **Loss** | Realized: write-offs − recoveries. Expected: the reserve. **Reported separately, always.** | `REALIZED_LOSS`, `LOSS_RESERVE` |

**Why the separations matter:** conflating delinquency with loss overstates losses early and hides
them late; conflating reserve with realized loss lets you smooth results; netting recoveries against
write-offs hides gross loss. In a 12-week experiment whose *only* output is a credible loss number,
these three conflations would each independently invalidate the result.

### 5.3 Structure

```sql
-- Every entry: append-only, double-entry, BigInt atoms, one currency per entry.
ledger_entries(
  entry_id           UUID PRIMARY KEY,
  obligor_id         UUID NOT NULL,               -- RLS tenant axis
  facility_id        UUID,                        -- NULL for treasury/lane-level entries
  sequence_number    BIGINT NOT NULL,             -- per-facility monotonic
  epoch              INTEGER NOT NULL,
  lane               TEXT NOT NULL CHECK (lane IN ('A_POL','B_OPERATOR','C_VENUE','D_LENDER')),
  tranche            TEXT NOT NULL DEFAULT 'none',-- Lane-D-ready, zero-filled in v0
  account            TEXT NOT NULL,               -- from the closed chart of accounts
  direction          TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  chain_id           INTEGER NOT NULL,
  token_address      TEXT NOT NULL,
  decimals           SMALLINT NOT NULL,
  amount_atoms       NUMERIC(78,0) NOT NULL CHECK (amount_atoms > 0),  -- uint256-safe, integer-only
  entry_type         TEXT NOT NULL,               -- draw|charge|repayment|reclass|writeoff|recovery|provision|correction|memo
  transaction_id     UUID NOT NULL,               -- groups the balanced set
  corrects_entry_id  UUID REFERENCES ledger_entries(entry_id),
  reason             TEXT,                        -- REQUIRED when corrects_entry_id IS NOT NULL
  idempotency_key    TEXT NOT NULL,
  policy_version_id  UUID NOT NULL,               -- every entry pins its methodology
  evidence_commitment TEXT,                       -- sha256: for evidence-derived entries
  onchain_tx_hash    TEXT,
  onchain_block_number BIGINT,
  onchain_block_hash TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
UNIQUE (facility_id, sequence_number)
UNIQUE (idempotency_key, account, direction)   -- the idempotency anchor
CHECK  (corrects_entry_id IS NULL OR reason IS NOT NULL)
-- append-only triggers + RLS + FORCE RLS + SECURITY DEFINER sole writer
```
`NUMERIC(78,0)` (not `BIGINT`) because 18-decimal token atoms exceed int64: 1M HONEY = 10^24.

### 5.4 Machine-checked invariants

| ID | Invariant | Enforcement |
|---|---|---|
| **L-1** | Every `transaction_id` balances: `Σ debit_atoms == Σ credit_atoms` per `(chain_id, token_address)` | DB constraint trigger at commit + reconciler |
| **L-2** | `drawn == repaid_principal + outstanding + delinquent + written_off` (exact BigInt, per facility) | hounfour `bigint_sum` constraint + reconciler |
| **L-3** | `drawn <= commitment` — **instantiates I-3** | DB check on draw + constraint |
| **L-4** | `treasury_onchain_balance >= Σ(commitment − drawn)` — **instantiates I-13** | reconciler #2, `severity: critical` |
| **L-5** | No entry mutated/deleted, ever | append-only triggers (verified working in arcturus) |
| **L-6** | Corrections never delete: a correction is a new pair citing `corrects_entry_id` + `reason` | DB check |
| **L-7** | No entry crosses `lane`; inter-lane movement only via an explicit labelled fee transfer | constraint on `transaction_id` grouping |
| **L-8** | `ATTRIBUTED_VALUE_BERACHAIN` is computable **only** from non-Lane-A accounts | formula validation — any reference to a Lane-A account fails |
| **L-9** | Balance is always derived by folding entries; no stored authoritative balance | code review + a test asserting no `UPDATE … SET balance` exists |
| **L-10** | Every entry pins `policy_version_id` | `NOT NULL` |
| **L-11** | Epoch seals form an unbroken chain: `seal[n].prev_seal_hash == seal[n-1].seal_hash` | `audit_trail_chain_valid` |
| **L-12** | Same `(epoch, evidence snapshot, policy_version_id)` ⇒ **byte-identical** seal | the replay test (§7 T-13) |

### 5.5 Audit proofs a third party can check without the private data

1. **Epoch seal chain** — verify `prev_seal_hash` linkage + Ed25519 signature over every seal. Proves
   no epoch was inserted, removed, or reordered.
2. **Account totals** — each seal publishes per-account debit/credit totals; recompute L-1/L-2 from
   the published totals alone.
3. **Evidence commitment** — a decision cites `evidence_commitment`; an NDA'd auditor recomputes
   `sha256(safeCanonicalize(bundle))` and gets a bit-identical match, or the Operator is lying.
4. **Decision determinism** — `decision_id = sha256(inputs_hash + policy_version_id)`; anyone with the
   published policy + the bundle recomputes the limit and the id.
5. **On-chain cross-check** — every draw/repayment carries `(tx_hash, block_number, block_hash)`,
   independently checkable against the public chain.

This satisfies "keep evidence private while methods remain reproducible": **public** = methods, seals,
totals, ids; **private** = payer identities, amounts, terms, legal names.

---

## 6. API, contracts, and data model

### 6.1 The smallest API surface

Two planes. **Operator plane** = S2S-JWT + 2-of-3 for money. **Public plane** = unauthenticated,
read-only, aggregate-only. No third plane in v0 (no obligor self-service portal — obligors are
onboarded by the Operator and read via signed export).

**Operator plane** (`/internal/v1/*`, svc-JWT via identity-api JWKS; every mutating call takes
`Idempotency-Key`; money calls additionally require `X-Operator-Signatures`):

| Method | Path | Purpose | Auth | Idempotency |
|---|---|---|---|---|
| `POST` | `/obligors` | Admit an obligor | svc-JWT + 1 operator | `(jurisdiction, legal_name_normalized)` |
| `POST` | `/obligors/:id/applications` | Delegate an application + wallets | svc-JWT + obligor SIWE proof | `(obligor_id, chain_id, address)` |
| `POST` | `/evidence/receipts` | Submit a **claimed** tx_hash for verification | svc-JWT | `(chain_id, tx_hash, log_index)` |
| `POST` | `/evidence/bundles` | Seal a bundle at `as_of_block` | svc-JWT | content hash (natural) |
| `POST` | `/oracle/attestations` | Run qualification, emit attestation | svc-JWT | derived attestation id |
| `POST` | `/policy/decisions` | Compute a bounded limit | svc-JWT | `sha256(inputs_hash+policy_version_id)` |
| `POST` | `/facilities` | Create an offer from a decision | svc-JWT + **2 operator sigs** | `decision_ref` |
| `POST` | `/facilities/:id/accept` | Record obligor acceptance | obligor signature | `facility_id` |
| `POST` | `/facilities/:id/draws` | **Authorize + disburse** | svc-JWT + **2 operator sigs** | client-supplied `draw_id` |
| `POST` | `/facilities/:id/repayments` | Record/collect a repayment | svc-JWT | `authorization_nonce` |
| `POST` | `/facilities/:id/default` | Declare default / write-off | svc-JWT + **2 operator sigs** | `facility_id` |
| `POST` | `/admin/pause` · `/admin/resume` | **Global kill switch** | **2 operator sigs** | `(action, reason_hash)` |
| `POST` | `/epochs/:n/seal` | Seal an epoch | svc-JWT | `epoch` |
| `GET` | `/facilities/:id` · `/facilities/:id/ledger` | Full private detail | svc-JWT | — |
| `GET` | `/reconciliation/latest` | Latest signed reconciler report | svc-JWT | — |

**Public plane** (`/v1/*`, no auth, aggregate-only, cacheable):

| Method | Path | Returns |
|---|---|---|
| `GET` | `/v1/methodology/:policy_version_id` | Full published ruleset + parameters (the glass box) |
| `GET` | `/v1/epochs` · `/v1/epochs/:n/seal` | Seal chain: hashes, per-account totals, signature |
| `GET` | `/v1/returnledger/summary?epoch=` | Chart-of-accounts totals, loss triangle, **bands not raw** |
| `GET` | `/v1/attestations/:id/public` | Aggregates only: qualified/raw/flagged, gate counts, `as_of_block(+hash)`, `policy_version_id` |
| `GET` | `/v1/health` | `{status, contract_version, policy_version_id, chain_head, indexed_head}` |

**Deliberately absent from v0:** any endpoint that lists obligors, exposes a payer address, returns a
raw score, or accepts a limit override. Each would be a privacy or integrity hole for zero
experimental gain.

### 6.2 PostgreSQL model (11 tables, one schema `arcturus_credit`)

```
obligors(obligor_id PK, legal_name_enc, legal_name_normalized_hash, jurisdiction,
         entity_type, controller_user_id, kyb_status, kyb_evidence_commitment,
         status, admitted_at, policy_version_id)
         UNIQUE(legal_name_normalized_hash, jurisdiction)

applications(application_id PK, obligor_id FK, display_name, status,
             delegated_at, revoked_at, agent_identity_ref)

application_wallets(id PK, application_id FK, chain_id, address, role∈{receiving,disbursement},
                    proof_ref, verified_at, revoked_at)
                    UNIQUE(chain_id, address, role) WHERE revoked_at IS NULL

verified_receipts(receipt_id PK, application_id FK, chain_id, tx_hash, log_index,
                  token_address, decimals, payer_address, recipient_address,
                  amount_atoms NUMERIC(78,0), block_number, block_hash,
                  confirmations, verified_at, rpc_agreement_count)
                  UNIQUE(chain_id, tx_hash, log_index)      -- the anti-double-count key

evidence_bundles(bundle_id PK /*=content hash*/, application_id FK, as_of_block,
                 as_of_block_hash, window_start_block, receipt_count,
                 body_enc, body_hash, signature, sealed_at)

attestations(attestation_id PK, application_id FK, bundle_id FK, policy_version_id,
             as_of_block, as_of_block_hash, raw_atoms, qualified_atoms,
             flagged_affiliated_atoms, dropped_dust_atoms, dropped_circular_atoms,
             distinct_qualified_payers, gate_breakdown JSONB, diagnostics JSONB,
             signature, computed_at, superseded_by FK NULL)

policy_decisions(decision_id PK, obligor_id FK, application_id FK, attestation_id FK,
                 policy_version_id, inputs_hash, recommended_limit_atoms NUMERIC(78,0),
                 binding_constraint, decided_by CHECK (decided_by='rule'),
                 explanation JSONB, decided_at)

facilities(facility_id PK, obligor_id FK, application_id FK, decision_id FK UNIQUE,
           commitment_atoms NUMERIC(78,0), chain_id, token_address, decimals,
           advance_rate_bps, origination_fee_bps, periodic_fee_bps, fee_period_days,
           term_weeks, repayment_split_bps, cure_window_days, default_after_days,
           state, opened_at, matures_at, closed_at)

operator_authorizations(authorization_id PK, action∈{facility_open,draw,writeoff,pause,resume},
                        subject_id, payload_hash, signatures JSONB /*≥2 distinct signers*/,
                        signer_count INT CHECK (signer_count>=2), authorized_at)
                        UNIQUE(action, subject_id, payload_hash)

ledger_entries(...)          -- §5.3, the append-only double-entry journal
outbox_events(...)           -- §4.7
epoch_seals(epoch PK, epoch_start_block, epoch_end_block, epoch_end_block_hash,
            entry_count, entries_hash, account_totals JSONB,
            prev_seal_hash, seal_hash UNIQUE, policy_version_id, signature, sealed_at)
```

**Cross-cutting DDL rules:** every table `ENABLE` + `FORCE ROW LEVEL SECURITY` keyed on `obligor_id`
(restoring what arcturus stripped, F-5) · `ledger_entries`, `verified_receipts`, `evidence_bundles`,
`attestations`, `epoch_seals` get BEFORE UPDATE/DELETE `prevent_mutation()` triggers · all writes to
`ledger_entries` funnel through a SECURITY DEFINER function with `REVOKE INSERT` from the app role
(the enforcement arcturus dropped) · **no `NUMERIC` with a scale, no `FLOAT`, no `DOUBLE` anywhere in
the schema** — CI greps for these.

### 6.3 The six required seams

| Seam | v0 implementation | Future swap (no re-architecture) |
|---|---|---|
| **Evidence commitment** | `evidence_bundles.body_enc` private + `body_hash` published via `commitment-root` | Set `commitment_root.anchor_tx_hash` to anchor on-chain |
| **Capped draw** | `draw_atoms <= commitment − drawn + repaid_principal`, checked in the same tx as the ledger write, plus a **global program cap** row | Per-tranche caps (Lane D) |
| **Repayment routing** | `repayment_split_bps` of each qualified receipt, collected via EIP-3009 pull | Auto-sweep contract / streaming |
| **Pause** | `POST /admin/pause` (2 sigs) sets a program flag; **all money paths check it and fail closed**; reads stay up | On-chain circuit breaker |
| **Roles** | `operator_admin` (2-of-3 for money), `operator_analyst` (read all), `service` (svc-JWT, no money), `public` (aggregates) | On-chain role registry |
| **Methodology pinning** | Every attestation, decision, entry, and seal carries `policy_version_id`; the ruleset is published at `/v1/methodology/:id` and its digest is CI-verified | Governance-ratified versions |

### 6.4 The structural bar against LLM authorization

Three independent, cheap mechanisms — defence in depth, because this is the constitutional rule:

1. **Schema:** `policy_decisions.decided_by` has `CHECK (decided_by = 'rule')`. There is no other legal value.
2. **Authorization:** a draw requires a row in `operator_authorizations` with `signer_count >= 2` over
   `payload_hash = sha256(facility_id, draw_id, amount_atoms, decision_id)`. Signatures are verified
   against operator public keys; no service holds an operator key.
3. **Purity:** the policy engine module is dependency-injected with **no network client and no model
   client**. A CI test asserts its import graph contains zero HTTP/LLM SDK dependencies, and a second
   test asserts `computeLimit()` is a pure function of `(attestation, policy)` — same input, same output,
   no clock.

An LLM-written memo may be stored in `facilities.notes`; that column is never read by any check.

### 6.5 Operator-controlled allocation (not live PoL)

Per the goal's preference: v0 has **no PoL integration**. Capital availability is a single
Operator-controlled row:
```
program_config(id PK, program_cap_atoms NUMERIC(78,0), per_obligor_cap_atoms,
               paused BOOLEAN, policy_version_id, updated_at, authorization_id FK)
```
Changing it requires 2 operator signatures and is itself a ledger memo entry. Lane A stays a
zero-filled partition — present in the schema, never written in v0.

---

## 7. Acceptance harness

**Design principle inherited from arcturus (its best property): keyless by default, and it must be
*impossible* to fake green.** Assertions that cannot be evaluated without a secret report
`TESTER-REQUIRED`, never `PASS`. Every test below runs against ephemeral Postgres + an **anvil fork of
Berachain 80094**, so on-chain paths are real without needing mainnet funds.

`pnpm acceptance` runs T-1…T-16 and exits 0 iff every evaluable assertion passes.

| # | Test | Setup | Assertion (exact) |
|---|---|---|---|
| **T-1** | **Valid payer/provider registration** | Admit obligor, delegate app, prove receiving wallet by SIWE | Obligor `active`; wallet `verified_at` set; **re-POST with same idempotency key returns the same `obligor_id` and creates no second row** |
| **T-2** | **Metered HONEY payment verified** | Anvil: payer transfers HONEY to the provider's receiving wallet; mine 32 blocks; submit tx_hash | `verified_receipts` row with `payer_address == the log's from` (not `tx.from`), exact `amount_atoms`, `decimals=18`, `block_hash` recorded |
| **T-3** | **x402-shaped metered work is bound to the payment** | Provider records a cost-atom for the served request; link to the receipt | Work and payment reconcile 1:1; an orphan payment (no work) is flagged, an orphan work (no payment) yields **no** revenue |
| **T-4** | **Replay rejected — same tx** | Submit the identical `(chain_id, tx_hash, log_index)` twice | 2nd → `409`; **row count unchanged; qualified_atoms unchanged** (the arcturus F-3 class of bug cannot recur) |
| **T-5** | **Replay rejected — insufficient depth** | Submit a tx with 5 confirmations | Rejected `INSUFFICIENT_CONFIRMATIONS`; **no** row written (fail-closed) |
| **T-6** | **Multi-Transfer tx is fail-closed** | One tx emitting 2 Transfers to the same recipient | **Rejected** (`>1 match`), not silently summed — the finn `receipt-verifier` invariant |
| **T-7** | **Affiliate payment excluded** | Payer is on the **populated** affiliate allowlist | `flagged_affiliated_atoms` increases; `qualified_atoms` unchanged. **Additionally asserts the allowlist is non-empty and contains no placeholder sentinel** — closes F-2/C-2 |
| **T-8** | **Circular flow excluded** | Provider funds wallet W; W pays the provider | W's payment is `dropped_circular_atoms`; not qualified |
| **T-9** | **Qualification accepted (clean)** | Two arms-length CEX-funded payers | Both fully qualified; `distinct_qualified_payers == 2` |
| **T-10** | **Qualification rejected (dust)** | Payment below the dust floor | `dropped_dust_atoms`; not qualified |
| **T-11** | **Bounded decision** | Qualified = 1,000 HONEY; advance rate 50%; absolute cap 10,000 | `recommended_limit == 500 HONEY`; `binding_constraint == 'advance_rate'`. **And:** with qualified = 100,000 → limit clamps to the cap, `binding_constraint == 'absolute_cap'`. **And:** zero history → limit **0** |
| **T-12** | **No-LLM + precision guards** | Static + runtime | Policy-engine import graph has zero HTTP/LLM deps; `decided_by='rule'` enforced by DB; **a draw without 2 distinct signatures is rejected**; and a repo-wide grep finds **no `Number(` applied to a BigInt and no float type** in `src/ledger/**`, `src/oracle/**`, `src/policy/**` (closes F-2) |
| **T-13** | **Same-`asOf` byte replay** | Run the full pipeline twice from the same snapshot, in **two separate processes** | Attestation, decision, and epoch seal are **byte-identical**; identical sha256. Then mutate `as_of_block_hash` → replay **fails** `EVIDENCE_REORG` (proves the pin is load-bearing, not decorative) |
| **T-14** | **Draw** | Authorize + disburse 500 HONEY | On-chain balance moves; `PRINCIPAL_OUTSTANDING == 500`; `availability == commitment − 500`; L-1 balances; **a re-POST with the same `draw_id` does not double-disburse** |
| **T-15** | **Partial then final repayment** | Collect 200, then 300 + fees via EIP-3009 | After partial: outstanding 300, fees allocated first per the waterfall. After final: outstanding **0**, facility `repaid`, L-2 holds exactly (`drawn == repaid + outstanding + delinquent + written_off`). **Reusing an EIP-3009 nonce fails on-chain** |
| **T-16** | **Failure paths** | (a) reorg a confirmed repayment; (b) pause mid-flow; (c) kill the process between chain-send and ledger-write | (a) compensating reversal, original entry still visible; (b) all money endpoints `503`, reads OK; (c) on restart the reconciler detects the orphan and **halts for a human** — it does not auto-resubmit |

**Assertions reported `TESTER-REQUIRED` (never faked green):** real-mainnet HONEY settlement with real
value; multi-provider RPC divergence against live infrastructure; the measured cost of the planted
forgery (needs real spend). Each prints the exact command a tester runs to evaluate it.

**CI:** the keyless suite (T-1…T-16 on anvil) runs on every PR with zero secrets, mirroring arcturus's
`acceptance.yml` — which I verified genuinely passes in 25 s.

---

## 8. The experiment

### 8.1 Two theses, separated — this is the most important design decision in §8

They are **independently falsifiable** and must never be reported as one number.

| | **Thesis A — Credit** | **Thesis B — Berachain/HONEY** |
|---|---|---|
| Claim | Deterministically-qualified metered revenue predicts repayment well enough that fee income covers loss at bounded caps | Berachain/HONEY is a viable rail for this, and the activity returns attributable value to the chain |
| Falsified by | F1 (no demand), F2 (evidence forgeable), F3 (unit economics), F4 (no predictive lift) | F5 (rail friction drives repayment elsewhere) |
| Measured in | Return Ledger: loss rate, fee income, servicing cost, offer→draw funnel | Rail log: attempt/success/latency/cost per repayment; `ATTRIBUTED_VALUE_BERACHAIN` |
| Could survive alone? | **Yes** — the product may work chain-agnostically (rail is a config change; `EvidenceBundle.chain_id` is unconstrained in-schema) | **No** — B is meaningless without A |

**Structural enforcement:** the Return Ledger's `ATTRIBUTED_VALUE_BERACHAIN` is computable **only** from
non-Lane-A accounts (invariant L-8), and the rail-friction log is a **separate artifact** from the loss
triangle. A single "it worked" verdict is not expressible in the output format. If A passes and B fails,
the correct conclusion is "build this, not necessarily here" — and v0 is built so that conclusion is
reachable rather than embarrassing.

### 8.2 Configurable hypotheses (not constants)

Every one of these is a row in the published methodology, versioned via `policy_version_id`. **None is
hardcoded**; a CI test asserts no magic numbers in the policy module.

| Parameter | v0 default | Status | How v0 tests it |
|---|---|---|---|
| Advance rate | **50%** of trailing qualified revenue | **HYPOTHESIS** | Vary 30/50/70% across obligors (stratified, pre-registered); observe loss by stratum |
| Lookback | **28 days** | **HYPOTHESIS** | Compute 14/28/56-day attestations in parallel; only 28d binds; compare predictive value ex post |
| Term | **8 weeks** | **HYPOTHESIS** | Fixed in v0 (varying term at N=5 is uninterpretable); record time-to-full-repayment distribution |
| Absolute cap | **$10,000 program / $2,000 per obligor** (HONEY-denominated at a pinned rate) | **HARD RISK LIMIT, not a hypothesis** | Enforced in DB; T-11 asserts the clamp |
| Loss threshold | **30% of program cap** | **KILL GATE, not a hypothesis** | Automated: reconciler trips the pause at 30% |
| Dust floor | $0.01 equivalent | HYPOTHESIS | Sensitivity re-run at 0 / $0.01 / $0.10 |
| Confirmation depth | 32 blocks | SAFETY PARAM | T-5 asserts fail-closed below it |
| Pricing | 1% origination + 2%/30d | **HYPOTHESIS (demand-critical)** | A fee-free pilot cannot falsify F1 — pricing must be real |

**Shadow-mode discipline:** parallel parameter sets are computed and logged but **never bind**. Only the
pinned `policy_version_id` authorizes. This gets sensitivity data at zero incremental risk.

### 8.3 Pilot design, and what it honestly proves

**3–5 obligors validates MECHANICS, not predictive lift.** Stated as a hard reporting constraint:

| Claim at N=3–5 | Verdict |
|---|---|
| "The loop closes: register → verify → qualify → limit → draw → repay → seal, with byte-replay" | **Provable.** Deterministic, not statistical. |
| "Evidence forgery costs more than the limit it obtains" | **Provable** for the *specific* attacks the red team runs. A pass is a lower bound, never proof of general security. |
| "Accounting conserves; audits reproduce from snapshots" | **Provable.** |
| "There is demand at real pricing" | **Weakly testable** — 0/20 offers is informative; 3/20 is not a market. |
| "Loss rate is X%" | **NOT provable.** At N=5, one default = 20%. The CI on any loss rate spans the whole decision space. |
| "History predicts repayment" (F4) | **NOT provable.** Requires ~50+ obligors / 500+ obligor-epochs. |

**Mandatory publication rule:** every reported rate carries its N and a Wilson CI, and any N < 30
observation is labelled `MECHANICS-ONLY — NOT A RATE ESTIMATE`. This is the same discipline as the PoC's
`TESTER-REQUIRED`, applied to statistics: refusing to overclaim *is* the product.

**Cohort structure:** Cohort 0 = 1–2 affiliated tenants, weeks 0–4, **excluded from every proof claim**
(the affiliate filter applies to the lender too — lending to yourself proves nothing). Cohort 1 = 3–5
external obligors, weeks 4–16. Plus **1 planted forger** (internally operated, measured spend) and
**2 prepaid controls** (comparable providers offered nothing, to measure volume lift).

### 8.4 The honest problem with the chain choice, stated up front

Berachain-native HONEY x402 volume is ~nil and the canonical x402 contract is **not deployed** on 80094
(verified). So v0's Cohort-1 evidence will largely be **originated by the pilot itself** — providers
switching (or adding) a HONEY payment option for real buyers. This means:

- **F5 is tested honestly** (rail friction is exactly what we measure), but
- **F1 is partly confounded**: a provider declining may be declining *the rail*, not *the credit*. v0
  therefore records the decline reason on every lost offer with a forced choice
  (`price | rail | terms | no_need | trust | other`), so F1 and F5 can be disentangled ex post.

If ≥50% of declines cite `rail`, the correct read is **B is falsified, A is untested** — and the next
step is a Base/USDC replication, not abandonment. Pre-committing to this reading now prevents
rationalizing it later.

---

## 9. Risk and economics

### 9.1 Legal obligor

The obligor is the **legal entity or natural person** in `obligors`, identified by `legal_name` +
`jurisdiction`, bound by a signed `FacilityAgreement`. **Not** a wallet, **not** an agent, **not** an
application. Wallets and applications are *delegates* of the obligor; they can be rotated or revoked
without changing the credit relationship or resetting history. This is the direct implementation of
"wallet identity is not economic identity", and it is the concept **no repo currently has** (C-9).

Enrollment is Operator-admitted, not permissionless: someone must be able to *owe*. A pseudonymous
wallet cannot be sued, invoiced, or collected from, so admitting one would make the loss data
meaningless. (Metering can be permissionless later; borrowing cannot be, in v0.)

### 9.2 Affiliate blocker (the credibility keystone)

**Rule:** revenue from any affiliate of the obligor or the Operator is *flagged and excluded*, never
counted. Affiliation = (a) the Operator's own addresses, (b) any address the obligor controls or that
appears on a funding cycle with the obligor's wallets, (c) any address the obligor discloses as related,
(d) any address a funding-graph pass links to the obligor's wallets within 2 hops.

**Three gates that must all hold before the first draw:**
1. The allowlist is **non-empty and contains no placeholder sentinel** — asserted by T-7 (this is
   defect C-2 turned into a build gate).
2. Filter 3 (circular-flow) runs on **real chain data**, not the synthetic graph — which requires
   fixing F-1 so a real provider compiles.
3. **Cohort 0 is excluded** from every published claim.

**Residual risk, stated:** a sufficiently patient adversary can create a genuinely unrelated-looking
payer funded through a CEX. The defence is not detection but **economics** — see 9.5.

### 9.3 Pricing, and the cost stack

| Component | v0 assumption | Note |
|---|---|---|
| Origination fee | 1% of commitment, charged at draw | Covers underwriting labour |
| Periodic fee | 2% per 30 days on outstanding (≈26% APR-equivalent) | Deliberately non-teaser; a free pilot cannot falsify demand |
| Cost of capital | Operator equity — **opportunity cost ~8–12%/yr**, booked explicitly | Must be booked or unit economics are fiction |
| Servicing cost | Dominated by **human** time: onboarding, verification review, collections, dispute handling. Book at a real hourly rate | At N=5 this will very likely exceed fee income — **that is a finding, not a failure**, and the question is whether it falls per-facility with N |
| Gas | Draw + repayment collection on 80094 | Negligible at current gas |
| **Break-even** | Fee income ≥ losses + capital cost + servicing | Report gross **and** fully-loaded; the fully-loaded number is the honest one |

At the $10k cap, total fee income across a 12-week program is on the order of a few hundred dollars.
**v0 cannot be profitable and is not meant to be** — it is meant to measure the *shape* of the cost
curve. Reporting a "profitable pilot" at this scale would be self-grading.

### 9.4 Expected loss and the first-loss waterfall

`EL = PD × LGD × EAD`. For uncollateralized micro-facilities to metered digital businesses, **PD and LGD
have no prior anywhere** — no repo has a single repayment record (C-13). v0 exists to create the first
data points, so v0 books a **deliberately conservative provision** rather than pretending to an estimate:

- `PD` prior: **30%** (matching the kill threshold — i.e. we provision as if the kill gate is the
  expected case, which is the conservative direction).
- `LGD`: **100%** — no collateral, no recourse beyond an off-chain claim of trivial value at $2k.
- Provision at draw: `30% × 100% × drawn` → `PROVISION_EXPENSE` / `LOSS_RESERVE`.
- **Reserve is reported separately from realized loss, always** (§5.2 #11/#12).

**Waterfall in v0 (single-tranche, deliberately trivial):**
```
Loss on any facility
  └─► 100% Operator equity (Lane B).  There is no other tranche.
Recoveries
  └─► fees receivable → principal → RECOVERIES (never un-writes-off)
```
Lane A never absorbs loss (an emission subsidising a credit loss would be laundering emissions into
loss cover). Lane D does not exist. So the waterfall is one line — and that simplicity is a feature:
there is no way to hide a loss in a tranche.

### 9.5 Sybil / forgery economics (the real defence)

The invariant: **limit < measured cost of fabricating the qualifying history.**
Fabrication cost = wash volume needed (= limit ÷ advance rate) × (payment fees + gas + CEX-funding cost
+ 28 days of time) + the cost of evading the affiliate/circular gates via genuinely distinct funding.

At a 50% advance rate, a $2,000 limit requires ~$4,000 of *qualified* wash revenue that survives all
three gates for 28 days. The red team's job is to produce the **measured** number; if measured cost
< 2× obtainable limit, kill gate **K1** trips. Note the mechanism is economic, not cryptographic: caps
are bounded so forgery is unprofitable, rather than assuming forgery is impossible.

### 9.6 Cross-chain conversion (kept out of the economic path)

v0 has **one asset on one chain** (HONEY on 80094) — so there is no FX inside the ledger. Where a USD
figure is needed for reporting or the cap, it is a **derived, separately-versioned** value:
```
{ amount_atoms, chain_id, token_address, decimals,      ← the authoritative money
  usd_equivalent_micro, rate_source, rate_as_of_block, rate_policy_version_id }  ← derived, never authoritative
```
Rules: no ledger entry is ever denominated in USD · the `$10,000` cap is converted to HONEY atoms **once**
at facility open and stored as atoms (so a price move cannot silently raise exposure) · HONEY is a
fully-collateralized USD stablecoin, but v0 does **not** assume a 1:1 peg — it records the rate source and
treats depeg as a named risk. If evidence later arrives from another chain (a future seam), conversion
happens **outside** the ledger, with its own methodology version.

### 9.7 Named risks with mitigations

| Risk | Severity | Mitigation in v0 |
|---|---|---|
| **HONEY is a pausable proxy** (verified: proxy bytecode) — admin action could freeze repayment | **High** | Named, monitored; rail-friction log; USDC fallback admissible but logged as F5 evidence. Not mitigable by us — disclosed to obligors. |
| Reorg invalidates evidence after a draw | Medium | 32-block depth; `as_of_block_hash` pin; replay re-checks; compensation path (§4.6) |
| Operator key compromise | **High** | 2-of-3; no service holds an operator key; hard program cap bounds total loss to $10k |
| Wash revenue evades all gates | High | Bounded caps (9.5); red team; K1 |
| Obligor absconds | **Expected** | This is the thing being measured. Cap bounds it. |
| Service bug double-disburses | High | `draw_id` idempotency + `UNIQUE(chain_id,tx_hash)` + reconciler #1 + never blind-retry |
| Ledger drift vs chain | Medium | Reconciler #1 + #2, signed reports, treasury adequacy (L-4/I-13) |
| Legal: unlicensed lending / usury | **High, unresolved** | **Counsel review is a hard precondition to the first draw** (issue #0 in §10). Not an engineering mitigation. |
| Overclaiming from a tiny sample | **High (reputational)** | §8.3 mandatory `MECHANICS-ONLY` labelling |

### 9.8 Kill and graduation gates

**Kill (any → automatic pause + published post-mortem):**

| # | Trigger | Automated? |
|---|---|---|
| **K1** | Planted forger obtains any non-zero limit, **or** measured forgery cost < 2× obtainable limit | Manual (red-team review) |
| **K2** | Realized loss > **30%** of the $10k program cap | **Yes** — reconciler trips the pause |
| **K3** | ≥20 qualified offers made, **0** signed after 8 weeks | Manual (funnel review) |
| **K4** | Any capital authorization without 2 valid signatures + a rule decision, **or** any decision not byte-replayable | **Yes** — T-12/T-13 in CI + runtime check; treat as a governance incident |
| **K5** | Any ledger invariant (L-1…L-4) violated in production | **Yes** — reconciler |

**Graduation from v0 (ALL required to proceed to a larger book):**
1. ≥3 external obligors each completed ≥4 clean weekly cycles.
2. Realized loss ≤ 10% of drawn volume.
3. Red team passed **twice**, with the forgery cost measured and published.
4. **100%** of decisions byte-replayable by an independent machine from snapshots alone.
5. Zero unresolved L-1…L-4 violations; all reconciler reports green for 4 consecutive weeks.
6. Fully-loaded servicing cost per facility **trending down** with N (the automation thesis).
7. Legal opinion obtained in the operating jurisdiction.
8. Every published number carries its N and CI, with `MECHANICS-ONLY` labels intact.

**Explicitly NOT a graduation criterion:** any claim of predictive lift (F4). That requires the next
stage's sample size, and saying so is the point.

---

## 10. Implementation plan

Ordered, GitHub-sized issues. Each has files, tests, migrations, deployment change, entry/exit criteria,
and rollback. **`#0` is a hard blocker on the first draw and is not an engineering task.**

New repo/service: **`arcturus-credit`** (in `loa-arcturus`, `src/credit/**`). Rationale in §5.1.

### Phase 0 — Preconditions (must complete before any money moves)

| # | Issue | Repo | Files | Tests | Entry → Exit | Rollback |
|---|---|---|---|---|---|---|
| **0** | **Legal opinion + Operator entity + 2-of-3 multisig** | — (ops) | Counsel memo; multisig addresses recorded in `program_config` | — | Entry: §2 scope frozen → Exit: written opinion on facility form + HONEY settlement in-jurisdiction; multisig deployed; 3 signers keyed | Do not proceed. No code rollback needed. |
| **1** | **Fix F-1: make the chain provider compile** | loa-arcturus | Add the 3 missing modules (`adapters/chain/{dune-sim-types,native-reader,config}.ts`); add `zod`/`viem`/`opossum` per `DEPENDENCY-PINNING.md`; fix `x402.routes.ts:235,272` header typing | `pnpm typecheck` clean | Entry: `typecheck` fails today → Exit: **`pnpm typecheck` exits 0**; a real (non-mock) provider instantiates | `git revert`; mock path unaffected |
| **2** | **Fix F-2: purge BigInt→Number from economic paths** | loa-arcturus | `src/oracle/oracle.ts:208,222` → integer-only: score as `(qualified*10^6)/raw` in BigInt (a `score_ppm` integer), diagnostics as bps-weighted BigInt | New: score at 10^16 atoms shows the 1-micro shortfall; weighted sum exact at 2^53+1; **CI grep asserts no `Number(` on a BigInt under `src/oracle/**`** | Entry: proved false-perfect score → Exit: both probes pass; 10/10 existing tests still green | `git revert`; oracle output shape changes (bump `policy_version_id`) |
| **3** | **Fix F-3/F-4: mount a verified payment path or delete the dormant one** | loa-arcturus | **Decision: delete** `src/routes/x402.routes.ts` from v0 (it is unmounted, has a fatal nonce bug, and accepts client-asserted evidence). Replace with the finn-derived verifier in #6 | Test asserting no unmounted route exports remain | Entry: F-3/F-4 proved → Exit: dead route removed; nothing regresses (nothing imported it) | Restore file; it was inert |
| **4** | **Populate the affiliate allowlist (fix C-2)** | loa-arcturus | Replace `config.ts:49-58` placeholders with real cited addresses (Operator treasury, deployer, team) + a provenance file | Test: allowlist non-empty **and** contains no sentinel; fails CI otherwise | Entry: Filter 1 is a no-op → Exit: T-7 passes | Revert; but then no draws allowed (gate 9.2.1) |

### Phase 1 — Protocol (hounfour)

| # | Issue | Files | Tests | Entry → Exit | Rollback |
|---|---|---|---|---|---|
| **5** | **`TokenAmount` primitive** | `src/economy/token-amount.ts`; add to `SCHEMAS` in `scripts/generate-schemas.ts`; `constraints/TokenAmount.constraints.json`; `vectors/TokenAmount/**`; rebuild + commit `dist/`; `integrity:generate`; SCHEMA-CHANGELOG + MIGRATION | Vectors valid/invalid/boundary; constraint: addable iff `(chain_id, token_address, decimals)` equal | Entry: 18-dec HONEY vs 6-dec micro weld → Exit: `npm run check:all` green (`schema:check`, `check:constraints`, `check:dist-parity`, `check:release-integrity-parity`) | Additive **MINOR**; revert the commit — no consumer depends on it yet |
| **6** | **The 10 credit schemas + constraints + vectors** | `src/economy/{obligor,delegated-application,evidence-bundle,qualified-revenue-attestation,credit-policy-decision,facility-agreement,facility-draw,facility-repayment,facility-default-record,return-ledger-epoch-seal}.ts` + 10 constraint files + vectors | Per-schema vectors; conservation constraints (L-2, L-3/I-3); crypto-bearing tests must use `assertCryptoBearingFailsByDefault()` and register names in `check-class-policy-boundary.ts` | Entry: #5 merged → Exit: `check:all` green; `additionalProperties:false` on all 10; **watch the pollution grep** (no `Loa`/`grimoire`/`beads` in added lines) | Additive MINOR; revert |
| **7** | **Instantiate I-3 / I-13 + register event types** | `src/integrity/conservation-properties.ts` (bump `total_count` + `coverage`); `src/vocabulary/event-types.ts` (+19 `credit.*` literals) | Registry self-consistency constraints still pass | Entry: #6 merged → Exit: `check:all` green | Revert |

### Phase 2 — Evidence (the F-4 fix, the core build item)

| # | Issue | Files | Tests | Entry → Exit | Rollback |
|---|---|---|---|---|---|
| **8** | **Extract + re-point finn's receipt verifier** | `loa-arcturus/src/credit/evidence/receipt-verifier.ts` (from `loa-finn/src/x402/receipt-verifier.ts` @ `69f3f8a7`, AGPL provenance header); generalize `usdcAddress`→`{token_address, decimals}`; add 80094 + HONEY `CHAIN_CONFIGS`; **≥2 RPC endpoints must agree**; depth 32 | Port finn's 21 passing tests; **add** T-2, T-5, T-6 on an anvil 80094 fork | Entry: #1 merged → Exit: a real HONEY transfer yields a `verified_receipts` row with the payer from the **log**, not `tx.from`; all fail-closed cases reject | Revert; no evidence accepted (fail-closed = safe) |
| **9** | **Evidence store + bundle sealer** | `src/credit/evidence/{store,bundle-sealer}.ts`; migration `0006_verified_receipts.sql`, `0007_evidence_bundles.sql` | T-4 (replay), T-13 reorg leg (`as_of_block_hash` mismatch → `EVIDENCE_REORG`) | Entry: #8 → Exit: bundle id == content hash; re-seal idempotent | Drop the 2 tables (v0-only data) |

### Phase 3 — Oracle + policy

| # | Issue | Files | Tests | Entry → Exit | Rollback |
|---|---|---|---|---|---|
| **10** | **Re-point the oracle at real evidence, atoms, and `as_of_block`** | `src/oracle/{oracle,config,types}.ts` — read `verified_receipts` not `x402_settlements`; `as_of_block(+hash)` replaces `asOf: Date`; all sums in atoms | T-7…T-10; existing 10 tests adapted; T-13 byte-replay in 2 processes | Entry: #2, #4, #9 → Exit: attestation emitted + signed; byte-identical across processes | Revert; `policy_version_id` bump makes the change explicit |
| **11** | **Policy engine (pure, no-LLM)** | `src/credit/policy/{limit,version}.ts`; migration `0008_policy_decisions.sql` | T-11 (all three binding constraints incl. zero-history → 0); **T-12** import-graph + purity + `decided_by` CHECK | Entry: #10 → Exit: `decision_id` reproducible from published policy + bundle | Drop table; no facility can open |

### Phase 4 — Ledger + money

| # | Issue | Files | Tests | Entry → Exit | Rollback |
|---|---|---|---|---|---|
| **12** | **Facility ledger (schema + invariants)** | migrations `0009_ledger_entries.sql` (append-only triggers, RLS+FORCE RLS, SECURITY DEFINER writer, `REVOKE INSERT`), `0010_facilities.sql`, `0011_operator_authorizations.sql`; `src/credit/ledger/**` (BigInt only) | L-1…L-12 unit + live-PG: append-only blocks UPDATE/DELETE; RLS blocks cross-obligor (**against real Postgres, not a mock** — freeside only ever asserted RLS against `MockRLSDatabase`) | Entry: #11 → Exit: balanced double entry; all invariants enforced | Drop schema `arcturus_credit` |
| **13** | **Outbox + reconcilers** | `src/credit/outbox/{relay,worker}.ts`; `src/credit/recon/{chain-ledger,treasury,outbox-drain}.ts`; migration `0012_outbox_events.sql` | Same-tx write+enqueue; at-least-once with dedupe; reconciler detects a planted orphan and **halts** | Entry: #12 → Exit: 3 signed reports; no `published_at IS NULL` > 5 min | Disable relay (events queue harmlessly) |
| **14** | **Draw saga (2-of-3, HONEY disbursement)** | `src/credit/money/{draw-saga,treasury-client}.ts`; `POST /internal/v1/facilities/:id/draws` | T-14; T-16(c) crash between send and write; **draw with 1 signature rejected**; duplicate `draw_id` does not double-disburse | Entry: #13 + **#0 legal** → Exit: on-chain HONEY moves on an anvil fork; ledger balances | **Pause** (2 sigs) then revert; outstanding draws are collected manually |
| **15** | **Repayment collection (EIP-3009)** | `src/credit/money/{repayment,eip3009}.ts`; waterfall fees→principal | T-15 partial + final; nonce reuse fails on-chain; L-2 exact | Entry: #14 → Exit: facility reaches `repaid` with outstanding 0 | Pause; collect manually |
| **16** | **Default / write-off / recovery** | `src/credit/money/default.ts`; migration `0013_default_records.sql` | Delinquency reclass ≠ loss; recovery never un-writes-off; reserve reported separately | Entry: #15 → Exit: full lifecycle exercised | Drop table |

### Phase 5 — Publication + harness

| # | Issue | Files | Tests | Entry → Exit | Rollback |
|---|---|---|---|---|---|
| **17** | **Epoch sealer + Return Ledger + public API** | `src/credit/returnledger/{sealer,report}.ts`; migration `0014_epoch_seals.sql`; `GET /v1/{methodology,epochs,returnledger/summary,attestations/:id/public,health}` | Seal chain unbroken; L-8 (any Lane-A reference in the attribution formula fails); byte-identical re-seal | Entry: #16 → Exit: an independent party verifies the chain + totals from public data alone | Stop sealing; ledger unaffected |
| **18** | **`pnpm acceptance` (T-1…T-16) + keyless CI** | `scripts/acceptance.ts`; `.github/workflows/acceptance-credit.yml` (anvil 80094 fork, **zero secrets**) | All 16; unevaluable → `TESTER-REQUIRED`, never PASS | Entry: #17 → Exit: green in CI with no secrets | Revert workflow |
| **19** | **Pause switch + ops runbooks** | `POST /internal/v1/admin/{pause,resume}`; runbooks: reorg, stuck draw, K2 trip, dispute intake | T-16(b): money endpoints 503, reads 200 | Entry: #18 → Exit: pause verified to block **every** money path | — (this *is* the rollback mechanism) |
| **20** | **Red-team obligor + shadow parameters** | `scripts/redteam/**` (wash rings, circular, dust, CEX-funded); shadow 14/28/56-day + 30/50/70% | Forger's limit is **0**; forgery cost measured and recorded | Entry: #19 → Exit: K1 evaluated with a real number | — |

### Deployment changes

| Change | Where | Note |
|---|---|---|
| New service `arcturus-credit` (Railway) + Postgres | new | Separate DB from billing-api (§5.1) |
| Register as an identity-api consumer | identity-api | `cell_api_keys` row + `operator_grants` per `(sub,aud,role)`; **production grants need 2-of-3** |
| 2 independent 80094 RPC endpoints | config | Agreement required; single-endpoint = fail closed |
| 2-of-3 HONEY treasury multisig | on-chain | Signers hold keys; **no service process holds one** |
| Secrets | Railway | RPC urls, DB url, evidence-encryption key, svc-JWT key. **Operator keys are never server-side.** |
| Cron | Railway | 3 reconcilers + outbox relay + weekly sealer |

### Critical path

```
#0 legal ─────────────────────────────────────────────┐ (blocks #14 only)
#1 typecheck ─► #8 verifier ─► #9 evidence ─► #10 oracle ─► #11 policy ─► #12 ledger
#2 precision ──────────────────┘                          #13 outbox ──┘
#4 allowlist ──────────────────────────────────────────► #14 draw ─► #15 repay ─► #16 default
#5 TokenAmount ─► #6 schemas ─► #7 invariants ─────────┘                            └► #17 ─► #18 ─► #19 ─► #20
#3 delete dead route (independent)
```
**#1, #2, #3, #4, #5 are all parallelizable on day one.** The longest chain is
`#5 → #6 → #12 → #14 → #15 → #16 → #17 → #18`, and **#14 additionally waits on #0**, which should start
immediately since it is the only item with an external dependency.

### Global rollback

Because v0 is a separate service and schema with a hard $10k cap: **pause (2 sigs) → collect outstanding
manually → drop schema `arcturus_credit`**. Nothing in billing-api, finn, identity-api, or the live
platform depends on it. Total downside is bounded by the program cap plus the hounfour additions, which
are additive-MINOR and independently revertible.

---

## Appendix A — What I could not verify

Stated explicitly so nobody treats this pack as more grounded than it is.

| Item | Status |
|---|---|
| Market data in `09` (BERA price, TVL, emissions, x402 volume) | **UNVERIFIABLE / time-decaying.** Not depended upon anywhere in v0. |
| ERA program mechanics, DES `emissionPerc` | **UNVERIFIABLE from repos** (forum/docs-sourced). Lane A is deferred, so not load-bearing. |
| `loa-freeside@f0354ff…` (the provenance commit arcturus cites) | **Not verifiable** — my clones are depth-1 squashes; the object is absent. Content comparison at HEAD showed no semantic drift in the two copied files. |
| Whether the pilot's 3–5 obligors exist / will sign | **Unknown.** This is falsifier F1 and the single largest non-technical risk. |
| Legal treatment of the facility in the operating jurisdiction | **Unresolved** — issue #0, a hard precondition. |
| Live-mainnet HONEY settlement with real value | **Not attempted.** v0's harness uses an anvil fork; the mainnet leg is `TESTER-REQUIRED` by design. |
| sonar-api `truth-contract` finality plane | Verified **unwired**; treated as a design asset, never as an existing guarantee. |

## Appendix B — Reproducing this audit

```bash
mkdir -p /tmp/arc-audit && cd /tmp/arc-audit
for r in loa-arcturus loa-hounfour loa-finn loa-dixie loa-freeside \
         sonar-api score-api identity-api billing-api ledger-api loa; do
  gh repo clone 0xHoneyJar/$r $r -- --depth 1
done   # compare rev-parse HEAD against the §0 table

# arcturus: reproduce green AND red
cd loa-arcturus && pnpm install
pnpm test          # 10/10 pass
pnpm typecheck     # FAILS — defect F-1
docker run -d --name arc-pg -e POSTGRES_USER=arcturus -e POSTGRES_PASSWORD=arcturus \
  -e POSTGRES_DB=arcturus -p 5544:5432 postgres:16
docker run -d --name arc-redis -p 6399:6379 redis:7-alpine
for f in migrations/000*.sql; do docker exec -i arc-pg psql -U arcturus -d arcturus -v ON_ERROR_STOP=1 -q < "$f"; done
export DATABASE_URL=postgres://arcturus:arcturus@localhost:5544/arcturus \
       REDIS_URL=redis://localhost:6399 CHAIN_PROVIDER=mock
pnpm seed:bepolia && pnpm verify   # exit 0; A✓ B✓ C=TESTER-REQUIRED D✓
pnpm seed:bepolia                  # re-run: 0 new, 6 already (idempotent)
docker rm -f arc-pg arc-redis

# billing-api: 30/30 · finn verifier: 21/21
cd ../billing-api && bun install && bun test
cd ../loa-finn && bun install && bun test tests/x402/receipt-verifier.test.ts tests/x402/atomic-verify.test.ts

# on-chain facts (§0.1)
curl -s -X POST https://rpc.berachain.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'          # 0x138de
curl -s -X POST https://rpc.berachain.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0xFCBD14DC51f0A4d49d5E53C2E0950e0bC26d0Dce","data":"0x313ce567"},"latest"]}'  # 0x12 = 18
curl -s -X POST https://rpc.berachain.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0x4020420042004200420042004200420042004200","latest"]}'                        # 0x = absent
```

