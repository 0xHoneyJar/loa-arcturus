# Oracle Methodology — Qualified Revenue Ruleset & Realness Score (Sprint 3, FR-5)

**Status:** PoC oracle methodology for loa-arcturus (Role 3 — Proof-of-Revenue Oracle).
**Authoritative spec:** `ROLE3-ORACLE-SPEC.md` §5 (ruleset & score), §9 (sequencing), §10.5 (mock).
**Design source:** `grimoires/loa/sdd.md` §4. **Sprint:** 3 — "The Oracle".
**Date:** 2026-06-11.

> **Scope:** this document is the OPEN methodology the spec requires — written so an
> external party can re-derive every per-service number the oracle publishes. It
> records the three open judgment calls (OPEN-3 affiliate allowlist, OPEN-4 dust
> floor, OPEN-5 weighting-vs-binary) and resolves them HONESTLY, not by inventing
> facts. The oracle is **read-only and fee-free**: it never writes chain state and
> never gates emissions. Role 1 (PoL) is OUT OF SCOPE
> (`ROLE3-ORACLE-SPEC.md:11-16, 170, 205, 211-219`).
>
> **Mechanism, not economy.** Every number below proves *the meter works* on
> seeded/synthetic data. It is NOT a claim that Berachain has $X of real agent
> revenue (`ROLE3-ORACLE-SPEC.md:30-32, 217-219`).

---

## 0. Where the code and the knobs live

| Concern | File |
|---|---|
| Score + filter orchestration | `src/oracle/oracle.ts` (`computeServiceRevenue`, `computeAllServices`) |
| OPEN-3 / OPEN-4 / OPEN-5 knobs (config-driven) | `src/oracle/config.ts` |
| Funding-graph + circular-flow cycle detection (net-new) | `src/oracle/funding-graph.ts` |
| Output / methodology shapes | `src/oracle/types.ts` |
| Read side of `x402_settlements` | `src/oracle/settlements-repo.ts` |
| Keyless deterministic provider | `src/adapters/chain/mock-chain-provider.ts` |
| Fixed synthetic funding graph (proof fixture) | `src/oracle/synthetic-graph.ts` |
| Live-DB driver (real Postgres) | `src/oracle/verify-live.ts` |
| Unit + determinism tests | `src/oracle/oracle.test.ts` |

---

## 1. Definitions (the headline is a ratio of unweighted sums)

For each service (`agent_id`) over an optional `[from, to)` settlement-time window:

- **Raw Revenue** `raw_micro` = Σ `actual_micro` over **all** settlements of the service.
- **Qualified Revenue** `qualified_micro` = Σ `actual_micro` over settlements that
  PASS the three binary gates (filters 1–3).
- **Realness score** = `qualified_micro / raw_micro` ∈ **[0,1]** (clamped; `raw=0 → score=0`).
- **`flagged_affiliated_micro`** = Σ `actual_micro` of settlements dropped by the
  affiliate gate — **labeled and excluded from the headline** (anti-self-grading).

Per-service output shape (`ServiceRevenue`, `src/oracle/types.ts`):

```jsonc
{
  "agent_id": "svc-thirdparty",
  "raw_micro": "200000005",
  "qualified_micro": "100000000",
  "score": 0.4999999875000003,
  "flagged_affiliated_micro": "0",
  "methodology": { /* version, provider_mode, as_of, formula,
                      weighting_reconciliation, filters[], breakdown{} */ }
}
```

All monetary values are **micro-USD** carried as `bigint` (NUMERIC(30,0) in
Postgres) — no floating point in the economic path. The only float is the final
`score` ratio.

---

## 2. The filter stack

Two binary gates and one net-new graph gate decide membership in
`qualified_micro`; two weights are diagnostics that never touch the headline.

| # | Filter | Kind | Effect |
|---|--------|------|--------|
| 1 | **Affiliate exclusion** | binary gate | Drop if `payer_address` ∈ allowlist; revenue is FLAGGED (not counted). |
| 2 | **Dust floor** | binary gate | Drop settlements with `actual_micro <` floor (anti-spam wash). |
| 3 | **Circular-flow** | binary gate | Drop if the payer sits on a funding cycle with the recipient (net-new). |
| 4 | **Wallet-age weighting** | diagnostic | Down-weight fresh wallets, up-weight aged. NOT in the headline. |
| 5 | **External-origin bonus** | diagnostic | Up-weight CEX/bridge/DeFi-funded payers. NOT in the headline. |

**Gate order is deterministic and documented:** affiliate → dust → circular
(`src/oracle/oracle.ts` `classify()`). Affiliate is first so affiliated revenue is
**always** attributed to `flagged_affiliated_micro`, even if it would also be dust
or circular — anti-self-grading takes precedence in attribution.

### Filter 3 is acknowledged NET-NEW

`ROLE3-ORACLE-SPEC.md:301-305` is explicit that `IChainProvider`'s always-available
methods are balance/ownership only, and that *"cycle-detection + funding-graph
analysis is net-new code you build on top of `getActivity`, not something the
port gives you for free."* The directed-graph construction and cycle detection in
`src/oracle/funding-graph.ts` **are** that net-new code. It is marked
`net_new: true` in the emitted methodology and is NOT inherited from loa-freeside.

**Cycle definition:** a payer is circular iff some address X (X ≠ payer) is both
reachable FROM the payer (payer →\* X) and able to reach BACK to the payer
(X →\* payer). For an x402 payer that pays its service wallet, a back-edge
service →…→ payer is exactly *"payer is funded by / routes back to the recipient
service wallet"* (`ROLE3-ORACLE-SPEC.md:153-154`). Detected with a forward reach
set and a reverse-reachability (transpose) BFS; witnesses are sorted for determinism.

---

## 3. OPEN-3 — Affiliate allowlist (Filter 1)

**Resolution: config-driven, seeded ONLY with clearly-labeled placeholders. Nothing invented.**

This is an anti-fraud tool. Inventing real-looking 0xhoneyjar wallet addresses
would itself be the fraud the oracle exists to detect, so we do not. The
**mechanism** (flag affiliated revenue, exclude it from the headline) works
regardless of which addresses populate the list.

Resolution order (`resolveAffiliateAllowlist`, `src/oracle/config.ts`):

1. `AFFILIATE_ALLOWLIST` — comma-separated addresses (env), **or**
2. `AFFILIATE_ALLOWLIST_FILE` — path to a file, one address per line (`#` comments ok), **or**
3. `PLACEHOLDER_AFFILIATE_ALLOWLIST` — built-in, intentionally-unmatchable placeholders.

The placeholders are sentinel non-payer addresses
(`0x0000…0000` labeled `PLACEHOLDER_HONEYJAR_TREASURY`, `0x0000…dead` labeled
`PLACEHOLDER_OPERATOR_WALLET`) that **cannot collide with a real on-chain `from`**.
Until a maintainer replaces them (or sets the env override), Filter 1 is a no-op
rather than silently mis-flagging a real payer.

> **PROVENANCE RULE:** any address that ends up on this list MUST come from a
> cited source (0xhoneyjar treasury registry / deploy records). The placeholders
> are explicitly NOT sourced and are labeled as such in code.

**How the live test exercises it honestly:** `verify-live.ts` does not ship a real
address either — it injects the *synthetic* affiliate payer (`ADDR.affiliatePayer`,
an obviously-fake `0xaff111…` label) into the allowlist at runtime, purely to drive
the flag mechanism. The synthetic affiliate is funded from a CEX in the graph, so
absent the allowlist it would look clean — proving it is the **allowlist flag**,
not its funding profile, that excludes it.

---

## 4. OPEN-4 — Dust floor (Filter 2)

**Resolution: documented, defensible default; tunable via env; never a magic literal.**

- **Default:** `DEFAULT_DUST_FLOOR_MICRO = 10_000` micro-USD = **$0.01 (one US cent)**.
- **Unit:** micro-USD, matching `x402_settlements.actual_micro` and the loa-freeside
  ledger convention `MICRO_PER_CENT = 10_000` (`src/services/x402-settlement.ts`).
- **Reasoning:** one cent is the smallest unit the existing quote/settle math
  already reasons in — the natural "below this is noise" boundary. A wash/spam farm
  drives up settlement **count** cheaply with sub-cent payments; a genuine
  arms-length API call is worth ≥ 1¢. Dropping strictly-below-1¢ settlements removes
  the cheapest farming vector without touching realistic demand.
- **It is a floor, not a fee:** it changes nothing on-chain and collects nothing
  (read-only PoC). It only decides what the meter COUNTS.
- **Tunable:** override via `DUST_FLOOR_MICRO`. Set `0` to disable the filter
  (every non-negative settlement clears the floor). Negative values are rejected
  loudly (`resolveDustFloorMicro` throws) — never a silent mis-floor.

The boundary is **strict less-than**: `actual_micro < floor` drops; exactly-floor
is kept (covered by the `0xexact` unit test).

---

## 5. OPEN-5 — Weighting (filters 4–5) vs binary (filters 1–3) reconciliation

**Resolution: the headline is reproducible from the binary rules ALONE. Filters 4–5
are diagnostics that never enter the score.** (This is sdd.md §4.3 option (a).)

The spec defines the score as `qualified/raw ∈ [0,1]` (a ratio of summed
`actual_micro`), but describes filters 4–5 as *"down-weight / up-weight"* — a
continuous operation incompatible with a clean ratio in [0,1]. Folding a continuous
weight into the headline would make the number **un-reproducible** without sharing
the exact weight curve. So:

- **Only the three binary gates** (affiliate, dust, circular) decide membership in
  `qualified_micro`. No weight ever multiplies a settlement's contribution to the
  headline. **This is why an external party gets the same headline number.**
- **Filters 4–5 are surfaced separately** as
  `methodology.breakdown.confidence_weighted_qualified_micro`:
  `Σ (qualified actual_micro × ageWeight × originMultiplier)`, floored to integer
  micro. It is a published diagnostic signal, explicitly NOT the headline.

The diagnostic curves (documentation, not headline math — defaults in
`DEFAULT_WEIGHTING`, all env-tunable):

```
ageWeight(d)     = clamp(AGE_WEIGHT_FLOOR + (1 - AGE_WEIGHT_FLOOR) * min(d, FULL)/FULL, floor, 1)
                   FULL = AGE_FULL_TRUST_DAYS (default 30), floor = AGE_WEIGHT_FLOOR (default 0.1)
originMultiplier = hasExternalOrigin ? EXTERNAL_ORIGIN_BONUS (default 1.25) : 1.0
```

Determinism: wallet age is computed relative to a caller-supplied `asOf` anchor —
the scoring path **never reads the wall clock** (`Date.now()` appears nowhere in
the oracle). Same settlements + same provider data + same `asOf` + same config →
byte-identical output.

---

## 6. Anti-self-grading (the philosophical core)

`ROLE3-ORACLE-SPEC.md:164-167` — credibility-critical:

- Every `agent_id` present in the window is indexed and held to the **same** filters
  (`computeAllServices` iterates all services, sorted; no per-service special-casing).
- 0xhoneyjar's own services are scored identically. Affiliated revenue is **labeled**
  (`flagged_affiliated_micro`) and **excluded** from the headline.
- There is **no code path that privileges affiliated revenue.** The oracle will
  report ~$0 qualified for a 0xhoneyjar service paid only by affiliated wallets —
  and that honesty IS the product.

---

## 7. Reproduce it yourself (live, on a real Postgres)

```bash
# 1. throwaway Postgres 16
docker run --rm -d --name arc-pg-s3 -e POSTGRES_PASSWORD=arcpoc -p 5436:5432 postgres:16
#    wait for: docker exec arc-pg-s3 pg_isready -U postgres

# 2. apply migrations 0001-0005 (psql lives inside the container)
for f in 0001_foundation 0002_credit_lots_lot_entries 0003_webhook_events \
         0004_usage_events 0005_x402_settlements; do
  docker exec -i arc-pg-s3 psql -U postgres -v ON_ERROR_STOP=1 -q < migrations/${f}.sql
done

# 3. run the oracle against the real table (MockChainProvider supplies the graph)
DATABASE_URL=postgres://postgres:arcpoc@localhost:5436/postgres npx tsx src/oracle/verify-live.ts

# 4. tear down
docker rm -f arc-pg-s3
```

### Verified output (live run, 2026-06-11)

Synthetic settlement set written through the same columns `settle()` writes, then
scored by `computeAllServices()` against the real `x402_settlements` table:

| service | raw | flagged_affiliated | qualified | score |
|---|---|---|---|---|
| `svc-honeyjar` | $100.00 | **$80.00** | $20.00 | **0.2000** |
| `svc-thirdparty` | $200.000005 | $0.00 | $100.00 | **≈0.5000** |

- **Anti-self-grading (svc-honeyjar):** an affiliated payer's $80 is flagged and
  EXCLUDED from the headline → qualified $20, score 0.20. The oracle does not
  flatter the affiliated service.
- **Farm-reduces / clean-survives (svc-thirdparty):** the circular-flow farm ($100)
  is dropped by Filter 3 and the dust payment ($0.000005) by Filter 2; both clean
  aged externally-funded payers ($40 + $60) survive → qualified $100, score ≈0.50.
  Removing the farm wallets would raise the score to 1.0 (clean-only); their
  presence demonstrably lowers it.
- **Determinism (Assertion D precursor):** byte-identical output on rerun (same
  sha256 across two separate `tsx` process invocations).

> `svc-thirdparty`'s score is `100000000 / 200000005 = 0.4999999875…`, not exactly
> 0.5 — the $0.000005 dust settlement is in Raw but not Qualified. That tiny gap is
> the dust filter visibly working, and it reproduces byte-for-byte.

---

## 8. Mock vs real data — what each mode proves

- `CHAIN_PROVIDER=mock` (`MockChainProvider`): runs the **full filter logic** with
  **zero external API keys**, over a fixed in-memory synthetic funding graph
  (`src/oracle/synthetic-graph.ts`). Proves the **mechanism**. Deterministic by
  construction — no clocks, no randomness, no network.
- `CHAIN_PROVIDER=dune` (real `getActivity`): exercises the **real-data** path
  against live chain activity. Proves the data integration (Sprint 4 / external).

The mock fabricates **no** claim about real Bepolia revenue — it only feeds the
filters a known graph so we can prove the meter classifies farm-like vs clean
wallets correctly (`ROLE3-ORACLE-SPEC.md:266-272`).
