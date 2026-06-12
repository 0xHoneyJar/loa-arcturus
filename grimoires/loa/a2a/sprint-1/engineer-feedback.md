# Senior Tech Lead Review — Sprint 1

**Sprint:** sprint-1 (AGPL Scaffolding & Curated Copy)
**Reviewer role:** review (adversarial)
**Date:** 2026-06-10
**Implementation report:** `grimoires/loa/a2a/sprint-1/reviewer.md`

---

## Verdict

**All good (with noted concerns)**

Concerns documented below are non-blocking against Sprint 1's acceptance
criteria, are explicitly acknowledged in the engineer's `reviewer.md`, and carry
tradeoff justification + NOTES.md Decision Log entries. The AC-Verification gate
is satisfied: the report's `## AC Verification` section is present and walks all
six ACs; the two `⚠ Partial` items (AC3/AC4) are environment-blocked (no
Postgres), honestly disclosed rather than faked, and paired with a runnable
verify command — not silent deferrals.

I reviewed the actual code and migrations, not just the report.

---

## Adversarial Analysis

### Concerns (≥3 required)

1. **`tsc` does not compile `src/` clean today (non-blocking for Sprint 1).**
   The 3 chain adapters import siblings not yet copied — `./dune-sim-types.js`,
   `./native-reader.js`, `./config.js` (verified by import-graph walk). So a
   naïve `tsc --noEmit` over all of `src/` would error.
   *Why non-blocking:* Sprint 1 AC2 (`sprint.md:52`) requires the §2 files
   **"present with headers intact"**, not a clean typecheck. The §2 adapter
   files ARE present, verbatim, with headers. The **settle() subgraph** —
   Sprint 1's real functional gate ("one settlement completes end-to-end",
   `sprint.md:81`) — is **fully import-closed** (verified: zero unresolved
   relative imports across x402-settlement → community-scope → credit-lot-service
   → lot-entry-repository → purpose-service → feature-flags → x402.routes).
   The unresolved imports are confined to the **oracle path (Sprint 3)** and are
   tracked as `loa-arcturus-hkj` + documented in `DEPENDENCY-PINNING.md`. Correct
   scoping, not an omission.

2. **AC3/AC4 (clean-DB run + end-to-end settle) were not executed live.** No
   Postgres/psql/Docker in the implementation environment. *Mitigation accepted:*
   a full static cross-check of every settle()-path SQL object/column/arity
   passed, and `migrations/run-migrations.sh` + the exact `docker run … psql`
   command are provided. The engineer did NOT claim a green run — this is the
   honesty the project demands. Residual flips to ✓ when the command exits 0 on
   a real PG. **This is the one item to actually run before merge.**

3. **`update_lot_status()` uses `ALTER TABLE … DISABLE TRIGGER`**, which requires
   table-owner privileges. In the strip-down (connect as DB owner, no
   `arrakis_app` role) this works, but it's a latent coupling: if a later sprint
   reintroduces a least-privilege app role, this function will fail unless made
   SECURITY DEFINER with proper ownership. It's on the depletion branch of
   `debitLots` (`credit-lot-service.ts:159`), so it WILL fire on a fully-consumed
   lot during settle(). Worth a note for Sprint 2.

### Assumptions made explicit

- **The strip-down assumes the PoC never serves multi-tenant traffic.** True for
  the Role-3 read-only meter, but if the oracle ever exposes a shared HTTP API
  over real customer data, the dropped RLS would need to return. Documented in
  `migrations/PROVENANCE.md` ("What 'strip RLS' costs").
- **`event_type TEXT` / `source TEXT` / `reference_id TEXT` column types** are
  inferred from the literals the copied code writes (`'payment_proof'`, `'x402'`,
  `tx_hash`). Reasonable, and provenance-honest (taken from the writer, not
  invented), but they are *inferred*, not lifted from an upstream DDL that
  defines them — because no such upstream DDL exists.

### Alternative approach not taken

- **Port `0001–0008` verbatim** (the "port-prereqs" option) instead of
  strip-down. This would have made the copied migrations apply unchanged and
  preserved RLS, at the cost of dragging in tenant-isolation machinery + the
  non-existent `arrakis_app`/`arrakis_admin` roles (which would *still* need
  manual `CREATE ROLE` outside any migration). The engineer chose strip-down for
  simplicity-first; the rejected alternative is documented. I agree with the
  call for a single-tenant read-only PoC.

---

## AC cross-check (independent of the report)

| AC | Reviewer finding | Agree with report? |
|----|------------------|--------------------|
| AC1 license | LICENSE 660L pure AGPL (commercial line cleanly removed), NOTICE credits freeside@f0354ff, CONTRIBUTING DCO + CLA-later | ✓ Met |
| AC2 §2 files + headers | 8 §2 files present, bodies verbatim, JSDoc preserved, provenance prepended | ✓ Met |
| AC3 clean-DB run | assembled + static-green; not run live (no PG) | ⚠ Partial — agree |
| AC4 settle() e2e | every insert shape reconciled + statically matched; not run live | ⚠ Partial — agree |
| AC5 OPEN-1 documented | `migrations/PROVENANCE.md` thorough, provenance on every fix | ✓ Met |
| AC6 no leave-behind | no leave-behind imports/DDL; config 3.2KB not 63KB | ✓ Met |

No fabricated evidence found; file:line citations in the report check out.

---

## Required before merge (not a Sprint-1 blocker)

- [ ] Run `migrations/run-migrations.sh` against a real Postgres and confirm exit
      0 (closes the AC3/AC4 residual). This is the human's to run when a DB is
      available — it was honestly deferred, not skipped.

Proceeding to security audit.
