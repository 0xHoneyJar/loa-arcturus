# Sprint 1 Implementation Report — AGPL Scaffolding & Curated Copy

**Sprint:** sprint-1 (epic `loa-arcturus-mk0`)
**Date:** 2026-06-10
**Build-order steps:** §8.1 (scaffold) + §8.2 (curated copy) — `ROLE3-ORACLE-SPEC.md:196-205`
**Spec (authoritative):** `ROLE3-ORACLE-SPEC.md`

---

## Executive Summary

Sprint 1 stands up the AGPL-licensed loa-arcturus repo and performs the curated
copy of the loa-freeside measurement primitives. All 5 tasks (1.1–1.5) closed.

Delivered: full AGPL-3.0 `LICENSE`, `NOTICE` (credits loa-freeside as AGPL
upstream, with commit-pinned provenance), `CONTRIBUTING.md` (DCO sign-off); 11
TypeScript files copied **byte-for-byte verbatim** (md5-verified) with original
JSDoc headers preserved and AGPL §5(a) provenance blocks prepended; 4 reconciled
migrations resolving the **OPEN-1** dependency chain via a documented strip-down;
dependency versions pinned against real loa-freeside manifests; and a green
leave-behind exclusion audit.

**Two honest caveats, surfaced not buried:**

1. **The clean-DB migration run was NOT executed live.** This environment has no
   `psql`, no Postgres server, and Docker is unavailable. Per the project's
   provenance-honesty rule a green run is **not** claimed. Instead: a full
   static cross-check of the `settle()` path against the schema passed, and a
   runnable harness (`migrations/run-migrations.sh`) + exact command are
   provided. See AC-1.4.1 below.
2. **The spec §2 copy list was incomplete** for a compiling/running file set.
   The real dependency closure is deeper (transitive TS deps; runtime
   dependence on upstream migration 0012; a second code↔schema drift). All
   surfaced explicitly, none resolved silently.

---

## AC Verification

Acceptance criteria quoted verbatim from `grimoires/loa/sprint.md:51-56`.

### AC1 — License files
> "`LICENSE` is full AGPL-3.0; `NOTICE` names loa-freeside as AGPL upstream; `CONTRIBUTING.md` requires DCO. CLA noted as later/optional only."

**Status: ✓ Met**
- `LICENSE:1` `### GNU AFFERO GENERAL PUBLIC LICENSE`, 660 lines, §13 network
  clause at `LICENSE:536`. Sourced from canonical `../loa-freeside/LICENSE.md`
  with the single freeside-specific commercial dual-license line removed
  (provenance: `PROVENANCE.md` "License files" table).
- `NOTICE:14-21` names "loa-freeside … License: AGPL-3.0" as upstream with
  commit `f0354ff` provenance.
- `CONTRIBUTING.md:23-46` DCO sign-off required (`git commit -s`); full DCO 1.1
  text at `CONTRIBUTING.md:50-83`. CLA "not required today … may be introduced
  later" at `CONTRIBUTING.md:87-93`.

### AC2 — §2 files present, headers intact
> "All files in the §2 list present with headers intact (`ROLE3-ORACLE-SPEC.md:60-68`)."

**Status: ✓ Met**
- 8 §2-listed files present: `src/services/x402-settlement.ts`,
  `src/routes/x402.routes.ts`, `src/services/credit-lot-service.ts`,
  `src/adapters/storage/lot-entry-repository.ts`,
  `src/adapters/chain/{dune-sim-client,hybrid-provider,provider-factory}.ts`,
  `src/core/ports/chain-provider.ts`.
- Bodies verified **byte-identical** to source (md5 of body == md5 of
  `../loa-freeside/<path>` for all 11 files; verification run during impl).
- Original loa-freeside JSDoc header preserved — e.g. `src/services/x402-settlement.ts:18`
  begins the original `x402 Settlement Service` header, directly under the
  prepended provenance block (`:1-16`).
- **Note on "headers":** upstream files carry **descriptive JSDoc**, not SPDX/
  AGPL per-file headers (verified: zero SPDX/AGPL tokens in any of the 8 source
  files). AGPL coverage is repo-level (`LICENSE`) + the prepended §5(a)
  provenance block. No AGPL header was fabricated where none existed — doing so
  would itself be provenance dishonesty.

### AC3 — clean-DB migration run, no missing-function/role errors
> "`docker compose up` (or equivalent local Postgres) runs every migration with no missing-function/role errors."

**Status: ⚠ Partial — assembled + statically verified; live run deferred (no Postgres in env)**
- Migrations `migrations/0001_foundation.sql` … `0004_usage_events.sql` assembled
  with the strip-down that removes exactly the missing-role dependency (the
  `arrakis_app`/`arrakis_admin` GRANTs that a clean DB rejects — see AC-1.4.1).
- **Static cross-check passed** (every object + column the `settle()` path
  touches exists; arity matches; `$$` balanced) — evidence under AC4/AC-1.4.1.
- **Not run live**: no `psql`/Postgres/Docker in this environment. Exact verify
  command documented in `migrations/PROVENANCE.md` "EXACT command" and
  `migrations/run-migrations.sh`. Honest deferral, not a faked pass. Tracked as
  the residual on this AC; flips to ✓ when `run-migrations.sh` exits 0.

### AC4 — single settlement drives settle() end-to-end
> "A single hand-crafted settlement drives `settle()` to completion (Raw Revenue computable end-to-end)."

**Status: ⚠ Partial — every insert shape statically reconciled; live exec deferred (same reason as AC3)**
- The 3 inserts + 2 function calls the real `settle()` path issues were each
  matched to a reconciled object/column:
  - `webhook_events`(provider,event_id,event_type,payload,processed_at) ←
    `0003_webhook_events.sql:25-31` (incl. the `event_type` drift fix).
  - `usage_events`(community_id,amount_micro,source,reference_id,created_at) ←
    `0004_usage_events.sql:40-50` (incl. the `source`/`reference_id` drift fix).
  - `credit_lots`(community_id,source,payment_id,amount_micro,expires_at) ←
    `0002_credit_lots_lot_entries.sql:25-33`.
  - `lot_balances` columns read by `debitLots` (`lot_id,remaining_micro,community_id`)
    ← `0002…:92-104` (view).
  - `app.insert_lot_entry_fn($1..$12)` ← `0002…:139` (12 params; repo passes 12).
- `migrations/run-migrations.sh` smoke test executes exactly these shapes and
  computes Raw Revenue inside a ROLLBACK. Flips to ✓ when run where Postgres exists.

### AC5 — migration-resolution + usage_events reconciliation documented with provenance
> "The migration-resolution decision (strip RLS/tenant machinery vs port `0001–0008`) and the `usage_events` reconciliation are documented with provenance — no silent schema invention."

**Status: ✓ Met**
- `migrations/PROVENANCE.md` — full record: dependency-chain table, strip-vs-port
  decision (strip-down, with rationale: single-tenant + read-only), per-migration
  strip/keep/fix table, and **provenance of every fix** (column types taken from
  the copied code that writes them, not invented).
- `usage_events` reconciliation documented at `migrations/PROVENANCE.md`
  ("The two code↔schema drifts" #1) and inline at `migrations/0004_usage_events.sql:14-44`.

### AC6 — no leave-behind dependencies present
> "No 'leave behind' dependencies present."

**Status: ✓ Met**
- Sweep of `src/` + `migrations/` for Discord/sietch-theme/construct/ensemble/
  NOWPayments/thirdweb/agent-gateway **imports**: none (only exclusion *prose*
  in `src/core/ports/index.ts:12` + PROVENANCE comments).
- No `crypto_payments` DDL (excluded from `0003`; only documented as excluded).
- `s2s_jwks_public_keys` + `reconciliation_cursor` (other upstream-0011 tables)
  not ported.
- arcturus `.loa.config.yaml` = 3.2 KB (its own), not freeside's 63 KB
  (deliberately left behind, `ROLE3-ORACLE-SPEC.md:71`).

---

## Tasks Completed

| Task | beads | Output |
|------|-------|--------|
| 1.1 LICENSE/NOTICE/CONTRIBUTING | `loa-arcturus-k6r` ✓ | `LICENSE` (660L AGPL), `NOTICE`, `CONTRIBUTING.md` |
| 1.2 Curated copy | `loa-arcturus-v6x` ✓ | 11 verbatim `.ts` files + trimmed `core/ports/index.ts` barrel; `PROVENANCE.md` |
| 1.3 Migrations + pinning | `loa-arcturus-4u3` ✓ | `migrations/0001-0004`, `package.json`, `tsconfig.json`, `DEPENDENCY-PINNING.md` |
| 1.4 OPEN-1 resolution | `loa-arcturus-2ri` ✓ | `migrations/PROVENANCE.md` (strip-down decision) |
| 1.5 Leave-behind + clean-DB | `loa-arcturus-2cz` ✓ | audit green; `run-migrations.sh` + verify command |

## Technical Highlights

- **Verbatim-copy discipline:** files copied via `cat` append (no shell var
  expansion → template literals safe), bodies md5-verified equal to source.
- **Curated trim of `core/ports/index.ts`:** upstream barrel re-exports ~14
  ports incl. `agent-gateway` (leave-behind); trimmed to chain-provider only so
  the curated-copy directive isn't violated by transitive re-export.
- **Strip-down keeps integrity, drops only isolation:** append-only triggers
  retained; only multi-tenant RLS/roles (not exercised by a single-tenant PoC)
  removed.

## Known Limitations / Discovered Issues

- **Live clean-DB run not executed here** (no Postgres) — AC3/AC4 partial; verify
  command provided. This is the single residual for full Sprint-1 sign-off.
- **`loa-arcturus-hkj`** (discovered): chain-adapter sibling closure
  (`dune-sim-types`/`native-reader`/`config` + zod/viem/opossum) deferred to
  Sprint 3 (oracle) — not on the settle() path, so out of Sprint 1's gate.
- Net-new findings vs planning docs: runtime dependence on upstream **0012**;
  roles created by **no** migration; **`webhook_events.event_type`** second
  drift. All in `migrations/PROVENANCE.md` + NOTES.md.

## Verification Steps (for reviewer)

```bash
# headers intact + verbatim bodies
for f in src/services/x402-settlement.ts src/routes/x402.routes.ts; do head -20 "$f"; done
# leave-behind absent
ck -n "from '.*discord|nowpayment|agent-gateway|thirdweb" src/ migrations/   # expect empty
# clean-DB run (where Postgres exists):
docker run --rm -d --name arcturus-pg -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16
DATABASE_URL="postgres://postgres:pg@localhost:5433/postgres" ./migrations/run-migrations.sh
docker rm -f arcturus-pg
```

## Constraints honored

Read-only/fee-free/PoL-free (no fee/treasury/PoL code introduced); `../loa-freeside`
treated read-only (only read/copied from); no git staging/commit/push/PR performed
(human stages); HONEY token standard left UNVERIFIED (not touched this sprint);
provenance preserved throughout.
