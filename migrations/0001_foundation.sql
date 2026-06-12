-- =============================================================================
-- loa-arcturus migration 0001 — Foundation (app schema + ledger helpers)
-- =============================================================================
-- OPEN-1 resolution: STRIP-DOWN of the loa-freeside migration dependency chain.
-- See migrations/PROVENANCE.md for the full strip-down-vs-port decision record.
--
-- This file ports the PREREQUISITE objects that the copied loa-freeside
-- migrations (0009/0010/0011/0012) reference but do not themselves define:
--   - schema `app`                            (upstream 0008_tenant_context_guard.sql)
--   - function app.current_community_id()      (upstream 0008)
--   - function app.set_community_context(uuid) (upstream 0008)
--   - function prevent_mutation()              (upstream 0009)
--   - function app.update_lot_status(uuid,text)(upstream 0009)
--   - function app.insert_lot_entry_fn(...)    (upstream 0012)
--
-- DELIBERATELY OMITTED (single-tenant, read-only PoC — these are loa-freeside
-- product surface, not meter mechanism):
--   - the roles `arrakis_app` / `arrakis_admin` (created by NO upstream
--     migration — assumed pre-existing infra in loa-freeside). All GRANT/REVOKE
--     statements that target them are dropped here; a clean Postgres has no
--     such roles, so keeping them would fail the "no missing-role errors" gate.
--   - SECURITY DEFINER ownership tricks tied to those roles (the canonical
--     insert function is kept but runs as the connecting user).
--
-- Provenance: derived from loa-freeside@f0354ff
--   themes/sietch/drizzle/migrations/0008_tenant_context_guard.sql
--   themes/sietch/drizzle/migrations/0009_credit_lots_lot_entries.sql (functions)
--   themes/sietch/drizzle/migrations/0012_foundation_infrastructure.sql (insert fn)
-- =============================================================================

-- --- app schema (upstream 0008) ---------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

-- app.current_community_id() — verbatim from upstream 0008. Kept so RLS-style
-- code and any future tenant scoping still resolve; on a single-tenant PoC the
-- GUC is set by withCommunityScope() but no RLS policy consults it (stripped).
CREATE OR REPLACE FUNCTION app.current_community_id()
RETURNS UUID AS $$
DECLARE
    tenant_id TEXT;
BEGIN
    tenant_id := current_setting('app.community_id', true);
    IF tenant_id IS NULL OR tenant_id = '' THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISSING: app.community_id must be set via SET LOCAL before accessing tenant-scoped tables'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN tenant_id::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- app.set_community_context() — verbatim from upstream 0008.
CREATE OR REPLACE FUNCTION app.set_community_context(community_uuid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.community_id', community_uuid::TEXT, true);
END;
$$ LANGUAGE plpgsql;

-- prevent_mutation() — verbatim from upstream 0009. Used by append-only
-- triggers on credit_lots / lot_entries / webhook_events / usage_events.
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % not permitted',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'P0002';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
