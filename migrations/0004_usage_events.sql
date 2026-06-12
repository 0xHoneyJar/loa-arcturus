-- =============================================================================
-- loa-arcturus migration 0004 — Usage Events (Raw Revenue ledger, reconciled)
-- =============================================================================
-- Derived from loa-freeside@f0354ff:
--   themes/sietch/drizzle/migrations/0011_usage_events_pg.sql
--
-- usage_events is NOT in the spec §2 copy list, but it is LOAD-BEARING for Raw
-- Revenue: settle() records actual_micro here (ROLE3-ORACLE-SPEC.md:78-79;
-- PRD FR-2a). Without it the real settle() path cannot complete.
--
-- OPEN-1 reconciliation — the central code↔schema drift (see PROVENANCE.md):
--   The copied settle() does:
--     INSERT INTO usage_events (community_id, amount_micro, source, reference_id, created_at)
--     VALUES ($1, $2, 'x402', $3, NOW())          (src/services/x402-settlement.ts:229-232)
--   but upstream 0011_usage_events_pg.sql defines:
--     - NO `source` column
--     - NO `reference_id` column
--     - `nft_id` and `pool_id` as NOT NULL
--   As-copied the insert FAILS (missing columns + NOT NULL violation on
--   nft_id/pool_id which settle() never supplies).
--
--   RESOLUTION (reconcile schema to the writer, no silent invention):
--     1. ADD `source TEXT` and `reference_id TEXT` — their existence and types
--        are taken DIRECTLY from the settle() INSERT (source receives the
--        literal 'x402'; reference_id receives proof.tx_hash). This is the
--        provenance: the shape comes from the copied code, not a guess.
--     2. DROP `nft_id`/`pool_id` from the NOT-NULL contract. They are
--        loa-freeside agent-pool accounting fields the x402 settle() path does
--        not populate. Kept as NULLABLE (not removed) to stay close to the
--        upstream shape while letting the real insert succeed.
--     3. RLS + arrakis_app GRANTs stripped (single-tenant PoC). Append-only
--        triggers KEPT.
--   Other upstream 0011 tables (s2s_jwks_public_keys, reconciliation_cursor)
--   are NOT ported — not on the meter's path.
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL,
  nft_id TEXT,                              -- RECONCILED: was NOT NULL upstream; settle() does not supply it
  pool_id TEXT,                             -- RECONCILED: was NOT NULL upstream; settle() does not supply it
  source TEXT,                              -- DRIFT FIX: written by settle() (literal 'x402')
  reference_id TEXT,                        -- DRIFT FIX: written by settle() (proof.tx_hash)
  tokens_input INTEGER NOT NULL DEFAULT 0 CHECK (tokens_input >= 0),
  tokens_output INTEGER NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
  amount_micro BIGINT NOT NULL DEFAULT 0 CHECK (amount_micro >= 0),
  reservation_id TEXT,
  finalization_id TEXT UNIQUE,
  fence_token BIGINT,
  conservation_guard_result BOOLEAN,
  conservation_guard_violations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (upstream 0011, retained where meaningful)
CREATE INDEX IF NOT EXISTS idx_usage_events_pg_community_created
  ON usage_events(community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_pg_finalization
  ON usage_events(finalization_id)
  WHERE finalization_id IS NOT NULL;
-- New: query Raw Revenue by source/reference (the reconciled columns)
CREATE INDEX IF NOT EXISTS idx_usage_events_source_reference
  ON usage_events(source, reference_id);

-- Append-only (upstream 0011 — KEPT)
CREATE TRIGGER usage_events_no_update
    BEFORE UPDATE ON usage_events
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER usage_events_no_delete
    BEFORE DELETE ON usage_events
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
