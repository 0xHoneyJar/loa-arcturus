-- =============================================================================
-- loa-arcturus migration 0003 — Webhook Events (x402 nonce dedup, reconciled)
-- =============================================================================
-- Derived from loa-freeside@f0354ff:
--   themes/sietch/drizzle/migrations/0010_webhook_events_crypto_payments.sql
--
-- OPEN-1 reconciliation (see migrations/PROVENANCE.md):
--   * `crypto_payments` is DELIBERATELY EXCLUDED. It is the NOWPayments outbound
--     payment state machine — explicitly on the "leave behind" list
--     (ROLE3-ORACLE-SPEC.md:69 — "NOWPayments payout machinery"). Upstream 0010
--     bundles it with webhook_events; the PoC ports only webhook_events.
--   * CODE↔SCHEMA DRIFT FIX (net-new finding, NOT in spec §2/§3): the copied
--     verifyNonceUnique() inserts an `event_type` column —
--       INSERT INTO webhook_events (provider, event_id, event_type, payload, ...)
--       (src/services/x402-settlement.ts:155)
--     but upstream 0010 defines NO `event_type` column. As-copied the insert
--     would fail. Resolution: ADD `event_type TEXT` (nullable) so the real
--     settle() nonce-dedup path runs end-to-end. Provenance: column shape taken
--     from the actual INSERT statement in the copied source, not invented.
--   * RLS + arrakis_app/arrakis_admin GRANTs stripped (single-tenant PoC).
--     Append-only triggers KEPT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('nowpayments', 'x402')),
  event_id TEXT NOT NULL,                   -- proof_nonce for x402
  event_type TEXT,                          -- DRIFT FIX: written by verifyNonceUnique() ('payment_proof')
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_events_provider_event_uq UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
  ON webhook_events(provider, processed_at);

-- Append-only (upstream 0010 — KEPT)
CREATE TRIGGER webhook_events_no_update
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER webhook_events_no_delete
    BEFORE DELETE ON webhook_events
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
