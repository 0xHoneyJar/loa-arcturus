# Security & Quality Audit — Sprint 2

**Sprint:** sprint-2 (The Gap (Payer Persistence) + Bepolia Config)
**Role:** audit (final quality gate)
**Date:** 2026-06-10

---

## Verdict

**APPROVED - LETS FUCKING GO**

No CRITICAL or HIGH findings. One MEDIUM (trust-boundary, pre-existing, correctly
deferred) and one INFO note below — neither blocks Sprint 2. The implementation
is provenance-honest, scope-disciplined, introduces no fee/treasury/PoL code, and
— unlike Sprint 1 — the migration chain was **verified live** on a real Postgres.

> **Audit mode note:** single-model audit. `flatline_protocol` is not enabled in
> `.loa.config.yaml`, so the cross-model dissenter phase did not run and the
> `adversarial-review-gate` hook does not fire on the COMPLETED marker (it gates
> only when flatline is enabled). No `DEGRADED_SECURITY_REVIEW` marker is set
> because the dissenter is disabled by configuration, not by a failure. Recorded
> for honesty.

---

## Audit dimensions

| # | Dimension | Result |
|---|-----------|--------|
| 1 | Hardcoded secrets (keys/tokens/passwords) in Sprint-2 files | ✅ none (only payer/tx placeholders in docs + `password=throwaway` in the disposable test container, never committed) |
| 2 | Fee / treasury / PoL / emission / reward-vault / splitter code | ✅ none. The lone `fee: bigint` (chain-provider.ts:388) is the **gas-fee field of the copied Dune-Sim `getActivity()` return type** — pre-existing verbatim copy, untouched, not protocol-fee logic |
| 3 | SQL injection / dynamic SQL | ✅ none. `0005` is pure DDL (no `EXECUTE format`/string-built SQL); the new `settle()` insert uses `$1..$8` placeholders. Template literals found are JS `Error` messages + Redis keys, not SQL |
| 4 | Parameterized queries on the new write | ✅ `x402_settlements` insert binds all 8 values as params; no `${}` interpolation into SQL |
| 5 | Provenance integrity of modified copied files | ✅ all three modified copied files (`x402-settlement.ts`, `chain-provider.ts`, `x402.routes.ts`) had their AGPL §5(a) notice updated from "reproduced verbatim" to a **dated change record** — required, since they are no longer verbatim |
| 6 | Migration applies on a clean DB (no missing fn/role/column) | ✅ **live-verified** 0001→0005 green on Postgres 16; teardown confirmed |
| 7 | Replay / double-count guard | ✅ `UNIQUE(chain_id, tx_hash)` live-rejected a duplicate; append-only triggers live-blocked UPDATE/DELETE |
| 8 | Debug/TODO/console.log leftovers in authored files | ✅ none |
| 9 | Scope discipline (no Sprint 3 work leaked) | ✅ no oracle module / filters / realness score / MockChainProvider; only comments reference "oracle" as forward context |
| 10 | Git cleanliness (no staging/commit/push; freeside untouched) | ✅ all new/modified app files untracked (`??`); `../loa-freeside` 0 dirty files |

---

## Findings

### MEDIUM-1 (trust-boundary, pre-existing, correctly deferred) — tx_hash not chain-confirmed before persistence
`settle()` persists `proof.chain_id` / `proof.tx_hash` as supplied by the client
in the `X-402-Payment` header; the server does not yet READ the chain to confirm
the tx before counting it (SDD §1.5 step 2, §5.4). This confirmation never
existed in the copied loa-freeside code and is **not** Sprint-2 scope (which is
payer persistence). The `UNIQUE(chain_id, tx_hash)` + nonce dedup prevent
replay/double-count at the DB, but an unconfirmed (chain_id, tx_hash) could still
be recorded. **Tracked** for the Sprint 4 acceptance harness (Assertion C —
"every counted tx_hash resolves on the explorer") as beads `loa-arcturus-7bi`.
Raised in `engineer-feedback.md` concern #1. No action for Sprint 2.

### INFO-1 (type consistency) — NUMERIC(30,0) vs BIGINT for micro-USD
`x402_settlements.{quoted,actual}_micro` are `NUMERIC(30,0)` (per spec Option B),
while `usage_events.amount_micro` is `BIGINT` (upstream). Both are exact integer
types (no float in the economic path) and are not summed in a single column, so
this is safe; following the spec's explicit `NUMERIC(30,0)` is correct, not
drift. Noted for whoever writes the oracle SQL (cast consistently when joining).

---

## Anti-fraud-specific checks (this project's threat model)

- **Provenance honesty:** Bepolia 80069 params (symbol BERA, decimals 18, RPC,
  explorer) **confirmed against a real source** — the canonical ethereum-lists
  EVM chain registry (`chainid.network/chains.json`, chainId 80069) — and cited
  in both the config comment and `docs/SETTLEMENT-MODEL.md`. OPEN-6 resolved
  honestly. ✅
- **UNVERIFIED stays UNVERIFIED:** the HONEY token standard / Bepolia contract
  address was **not** guessed. It is recorded as an explicit confirm-against-
  source task (OPEN-2) in `docs/SETTLEMENT-MODEL.md`; `settlementToken` is a
  display symbol string only, encoding no token ABI/address/standard. ✅
- **THE GAP closed without inventing schema:** every `x402_settlements` column
  traces to the spec's Option B DDL + the `X402PaymentProof` fields already in
  memory. The `payload='{}'` payer-discard is gone from the live settle() path. ✅
- **No premature Role-3→Role-1 weld:** read-only / fee-free / PoL-free preserved;
  self-broadcast (on-chain `from` == payer) kept as the anti-sybil anchor. ✅

---

## Acceptance

Sprint 2 passes the security/quality gate. Creating the COMPLETED marker.
