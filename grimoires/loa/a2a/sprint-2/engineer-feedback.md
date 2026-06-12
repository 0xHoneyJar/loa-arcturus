# Senior Tech Lead Review — Sprint 2

**Sprint:** sprint-2 (The Gap (Payer Persistence) + Bepolia Config)
**Reviewer role:** review (adversarial)
**Date:** 2026-06-10
**Implementation report:** `grimoires/loa/a2a/sprint-2/reviewer.md`

---

## Verdict

**All good (with noted concerns)**

The six Sprint-2 acceptance criteria are met and — crucially for this sprint —
the migration chain was **run live** (0001→0005 green on Postgres 16), not
statically cross-checked. The concerns below are non-blocking against Sprint 2's
ACs and are either pre-existing design (carried from the copy) or correctly
scoped to a later sprint. I reviewed the actual migration, the `settle()` diff,
the config, and the routes — not just the report — and re-ran the live DB checks.

---

## Adversarial Analysis

### Concerns (≥3 required)

1. **Persisted `chain_id` is client-asserted, and `tx_hash` is not yet confirmed
   by a chain read (pre-existing; not Sprint-2 scope).** `settle()` persists
   `proof.chain_id` / `proof.tx_hash` straight from the client-supplied
   `X-402-Payment` header (`x402.routes.ts:230-231`). The SDD's trust model
   (§1.5 step 2, §5.4) calls for the server to **READ the chain to confirm the
   tx before counting it** — that confirmation step does not exist in the copied
   code (it never existed in loa-freeside) and is **not** part of Sprint 2 (which
   is "persist the payer"). *Why non-blocking:* Sprint 2's job is to stop
   discarding the payer; it does that. The `UNIQUE(chain_id, tx_hash)` guard +
   the existing nonce dedup prevent replay/double-count at the DB. On-chain
   confirmation is harness/oracle work (Sprint 4 §7, and SDD §5.4's "unconfirmed
   tx_hash → reject"). **Flagged so it is not mistaken for done** — a payer could
   currently assert a `chain_id`/`tx_hash` the server never verified. Should be
   tracked for Sprint 4.

2. **`NUMERIC(30,0)` (x402_settlements) vs `BIGINT` (usage_events) for the same
   micro-USD value.** The new table follows the spec's Option B DDL
   (`NUMERIC(30,0)`), while `usage_events.amount_micro` is upstream `BIGINT`. So
   the same `actual_micro` is stored in two different numeric types across two
   tables. *Why non-blocking:* both are exact integer types (no float in the
   economic path), `BIGINT` max (~9.2e18) far exceeds any realistic micro-USD
   amount, and the oracle reads Raw Revenue from `usage_events` and
   Qualified-precondition payer data from `x402_settlements` — they are not
   summed together in a single column. The spec explicitly specified
   `NUMERIC(30,0)` for the settlements table, so following it is correct, not
   drift. Worth a one-line note for whoever writes the oracle SQL (cast
   consistently).

3. **`settlementToken` is a free-form string with no enum/validation.** The
   facilitator advertises whatever `settlementToken` is passed (default
   `'HONEY'`). A caller could advertise a token symbol the chain doesn't
   actually settle. *Why non-blocking:* it is a **display descriptor only** (the
   self-broadcast model means the payer chooses what they actually transfer;
   the server confirms by tx_hash, not by this string), and constraining it to a
   HONEY/USDC enum would risk baking in the very HONEY-standard assumption the
   sprint is required to leave UNVERIFIED. Free-form-symbol is the
   provenance-honest choice here. `chainKey`, by contrast, **is** validated
   against `CHAIN_CONFIGS` (throws on unknown) — the right asymmetry.

### Assumptions made explicit

- **The `>= 0` CHECK constraints and append-only triggers on `x402_settlements`
  go beyond the bare Option B DDL in the spec.** They are justified (no negative
  revenue; a settlements ledger must be immutable, matching the integrity
  mechanism kept on all four Sprint-1 tables), but they are additive design
  decisions, not literal spec text. Documented in the migration header.
- **`chainKey` default `'bepolia'`** assumes the PoC's default settlement chain
  is Bepolia. Correct for this PoC (the spec demonstrates on Bepolia 80069), but
  it means a deployment targeting mainnet 80094 must pass `chainKey: 'berachain'`
  explicitly. Reasonable default; noted.

### Alternative approach not taken

- **Option A (full proof JSONB in `webhook_events.payload`)** instead of the
  Option B table. Rejected — consistent with the Sprint-1 Decision Log: the
  oracle queries by `payer_address` and `(agent_id, window)`, which Option A
  would force through JSON extraction on every read. Option B was the spec's
  own recommendation for the oracle. Agreed.

---

## AC cross-check (independent of the report)

| AC | Reviewer finding | Agree with report? |
|----|------------------|--------------------|
| Option B table created | live `\d x402_settlements` matches §3.2 Option B (cols, types, UNIQUE, indexes) | ✓ Met |
| Payer persisted, none discarded | `settle()` Step 3b inserts proof.from inside the txn; live e2e shows payer_persisted; `payload='{}'` discard is gone from the live path | ✓ Met |
| UNIQUE(chain_id, tx_hash) rejects double-count | live duplicate insert raised the unique violation; per-chain uniqueness confirmed | ✓ Met |
| Bepolia 80069 + RPC + explorer; 80094 retained | `CHAIN_CONFIGS.bepolia` present, mainnet untouched; params from ethereum-lists registry | ✓ Met |
| No base/USDC/8453 on facilitator path | `ck`/grep find only change-notice + the client-proof parse `parsed.chainId` (correct) | ✓ Met |
| HONEY UNVERIFIED, not guessed | `docs/SETTLEMENT-MODEL.md` §2 records it as confirm-against-source; no ABI/address invented | ✓ Met |

No fabricated evidence; the live DB results in the report reproduce.

---

## Required before merge (not a Sprint-2 blocker)

- [ ] Track on-chain `tx_hash` confirmation (concern #1) for the Sprint 4
      acceptance harness / SDD §5.4 — the meter must reject unconfirmed txs
      before the oracle counts them. Honestly out of Sprint-2 scope; recorded so
      it is not lost.

Proceeding to security audit.
