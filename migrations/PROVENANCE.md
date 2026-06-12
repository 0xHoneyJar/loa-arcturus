# Migrations — OPEN-1 resolution & provenance

This document is the authoritative record for **OPEN-1**: how the copied
loa-freeside migrations' dependency chain and the `usage_events` code↔schema
drift were resolved. Per the project's provenance discipline, **no schema was
invented silently** — every column and object below traces to a specific
upstream file or to the copied source code that writes it.

Upstream snapshot: `loa-freeside@f0354ff14dff81ea1ed5189f6af00a0afcf068c3` (2026-06-08).

---

## TL;DR decision

**STRIP-DOWN, not port-verbatim.** The PoC is single-tenant and read-only, so
the loa-freeside RLS/tenant-isolation machinery is *product surface, not meter
mechanism*. The reconciled set ports the **prerequisite functions** the copied
code calls, **keeps the append-only integrity triggers**, and **strips** the
multi-tenant RLS policies + role GRANTs that a clean Postgres cannot satisfy
(the roles are never created by any upstream migration). Two real code↔schema
drifts are reconciled to the shape the copied code actually writes.

This matches the SDD's pre-registered preference (`sdd.md:187-191`,
"Strip-down is preferred… but the choice and the exact usage_events
reconciliation MUST be recorded with provenance").

---

## The dependency chain we found (deeper than spec §2/§3 recorded)

The spec §2 list names `0009 credit_lots`, `0010 webhook_events/crypto_payments`,
and credit-lot tables for copy. Tracing what the copied code and those
migrations actually require revealed a chain the planning docs under-specified:

| Object | Defined upstream in | In spec §2 list? | Who needs it |
|--------|--------------------|------------------|--------------|
| schema `app`, `app.current_community_id()`, `app.set_community_context()` | `0008_tenant_context_guard.sql` | ❌ no | RLS policies on 0009/0010/0011; `withCommunityScope` sets the GUC |
| `prevent_mutation()` | `0009` | ✅ (0009) | append-only triggers on all four tables |
| `app.update_lot_status()` | `0009` | ✅ (0009) | `debitLots()` → `credit-lot-service.ts:159` |
| `app.insert_lot_entry_fn(...)` + `REVOKE INSERT` | **`0012_foundation_infrastructure.sql`** | ❌ no | **runtime** `lot-entry-repository.ts:110` → every `settle()` |
| `lot_entries.correlation_id/purpose/sequence_number/causation_id` | **`0012`** (ALTERs) | ❌ no | the INSERT inside `insert_lot_entry_fn` |
| `idx_lot_entries_reservation_expiry` | **`0012`** | ❌ no | the expiry `ON CONFLICT` branch of `insert_lot_entry_fn` |
| roles `arrakis_app` / `arrakis_admin` | **no migration** — external infra | ❌ no | every `GRANT`/`REVOKE` in 0008–0012 |

> Net-new findings beyond the planning docs: the runtime path depends on **0012**
> (not just 0009/0010/0011), and the roles are **not created by any migration**.
> Both are logged in NOTES.md.

## The two code↔schema drifts

1. **`usage_events`** (the one the spec/PRD flagged) — `settle()` inserts
   `(community_id, amount_micro, source, reference_id, created_at)`
   (`src/services/x402-settlement.ts:246`), but upstream
   `0011_usage_events_pg.sql` has **no `source`/`reference_id`** and makes
   `nft_id`/`pool_id` **NOT NULL**. As-copied the insert fails twice over.
2. **`webhook_events.event_type`** (net-new finding — NOT in spec §2/§3) —
   `verifyNonceUnique()` inserts an `event_type` column
   (`src/services/x402-settlement.ts:172`) that upstream `0010` does not define.

---

## What each reconciled migration does

| file | upstream source | strip / keep / fix |
|------|-----------------|--------------------|
| `0001_foundation.sql` | 0008 (schema+guards) + 0009 (`prevent_mutation`) | **keep** `app` schema + `current_community_id` + `set_community_context` + `prevent_mutation`. **strip** the `GRANT … TO arrakis_app` lines (no such role). |
| `0002_credit_lots_lot_entries.sql` | 0009 (tables/view/`update_lot_status`) + 0012 (`insert_lot_entry_fn`, extra columns, expiry index) | **keep** tables, `lot_balances` view, append-only triggers, both partial-unique indexes, `update_lot_status`, `insert_lot_entry_fn`. **fold in** the four 0012 columns. **strip** RLS policies + `FORCE ROW LEVEL SECURITY` + role GRANTs + the `REVOKE INSERT` (its purpose — forcing writes through the SECURITY DEFINER fn — is moot without the revoked role; the fn is still the code's call path). |
| `0003_webhook_events.sql` | 0010 (webhook_events only) | **keep** webhook_events + triggers. **fix** add `event_type TEXT`. **exclude** `crypto_payments` entirely (NOWPayments leave-behind, `ROLE3-ORACLE-SPEC.md:69`). **strip** RLS + role GRANTs. |
| `0004_usage_events.sql` | 0011 (usage_events only) | **fix** add `source TEXT` + `reference_id TEXT`; make `nft_id`/`pool_id` nullable. **keep** triggers + core indexes. **exclude** `s2s_jwks_public_keys` + `reconciliation_cursor` (not on the meter path). **strip** RLS + role GRANTs. |

### Provenance of the *fixes* (no invention)

- `usage_events.source` / `reference_id`: types and presence taken **directly
  from the `settle()` INSERT** — `source` receives the literal `'x402'`,
  `reference_id` receives `proof.tx_hash` (both TEXT). Source: the copied code,
  not a guess.
- `webhook_events.event_type`: `TEXT`, taken from the literal `'payment_proof'`
  the copied `verifyNonceUnique()` writes.
- `nft_id`/`pool_id` made nullable rather than dropped: minimal deviation from
  upstream shape that lets the real insert (which omits them) succeed.

### What "strip RLS" costs and why it's safe here

RLS enforced *tenant isolation* — that one community can't read another's rows.
The PoC runs a single synthetic community and is **read-only** (the oracle never
serves multi-tenant traffic). The append-only **triggers** (the integrity
property the ledger actually relies on — no row is ever mutated/deleted) are
**kept**. So the economic invariants survive; only multi-tenant isolation —
which the PoC does not exercise — is dropped. This is recorded in NOTES.md
Decision Log.

---

## Verification status (HONEST)

**The clean-DB migration run was NOT executed in the environment that authored
Sprint 1** — that environment has no `psql`, no Postgres server, and Docker is
unavailable (`docker info` fails). Per the project's provenance honesty rule, a
green run is **not** claimed.

What WAS done instead:

1. **Static cross-check (passed).** Every SQL statement issued by the copied
   `settle()` path was matched against the reconciled schema:
   - object existence: `webhook_events`, `usage_events`, `credit_lots`,
     `lot_entries`, view `lot_balances`, functions `prevent_mutation`,
     `app.current_community_id`, `app.update_lot_status`,
     `app.insert_lot_entry_fn`, schema `app` — **all defined**.
   - column existence: every INSERT column for all three inserts — **all
     present**; `lot_balances` exposes `lot_id`, `community_id`,
     `remaining_micro` read by `debitLots()` — **all present**.
   - `insert_lot_entry_fn` arity: repository passes 12 args; function takes 12
     params — **match**.
   - `$$`-delimiter balance per file — **even** (no unterminated bodies).
2. **A runnable harness is provided:** `migrations/run-migrations.sh`. It applies
   0001→0004 with `psql -v ON_ERROR_STOP=1` and then runs a smoke test that
   executes the exact `settle()` insert shapes (nonce dedup, mint, usage_event,
   canonical lot entry) and computes Raw Revenue, inside a `ROLLBACK`.

### EXACT command to verify green (run where Postgres exists)

```bash
# throwaway Postgres in Docker:
docker run --rm -d --name arcturus-pg -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16
DATABASE_URL="postgres://postgres:pg@localhost:5433/postgres" ./migrations/run-migrations.sh
docker rm -f arcturus-pg
```

Expected: each migration prints with no missing-function/role error, and the
smoke test ends `OK — all migrations applied and the real settle() insert shapes
succeed.` Sprint 1's "clean-DB migration run is green" criterion is satisfied
when this command exits 0.
