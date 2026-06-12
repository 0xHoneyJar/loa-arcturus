-- =============================================================================
-- loa-arcturus migration 0002 — Credit Lots & Lot Entries (reconciled)
-- =============================================================================
-- Derived from loa-freeside@f0354ff:
--   themes/sietch/drizzle/migrations/0009_credit_lots_lot_entries.sql  (tables/view)
--   themes/sietch/drizzle/migrations/0012_foundation_infrastructure.sql (extra
--     lot_entries columns + insert_lot_entry_fn + expiry partial index)
--
-- OPEN-1 reconciliation (see migrations/PROVENANCE.md):
--   * RLS stripped: no ENABLE/FORCE ROW LEVEL SECURITY, no CREATE POLICY, no
--     GRANT ... TO arrakis_app/arrakis_admin. The PoC is single-tenant +
--     read-only; the roles do not exist on a clean DB. The append-only TRIGGERS
--     (the actual integrity mechanism) are KEPT.
--   * lot_entries columns from upstream 0012 (correlation_id/purpose/
--     sequence_number/causation_id) are FOLDED INTO the CREATE TABLE rather than
--     applied as later ALTERs, because insert_lot_entry_fn() writes them and the
--     PoC consolidates the chain into one forward-only set. `purpose` is TEXT
--     (matching what insert_lot_entry_fn passes); upstream 0013 later redefines
--     it as an enum — that economic-purpose tracking is NOT needed by the meter
--     and is intentionally not ported.
-- =============================================================================

-- --- credit_lots (upstream 0009, RLS/grants stripped) -----------------------
CREATE TABLE IF NOT EXISTS credit_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'purchase', 'grant', 'seed', 'x402', 'transfer_in', 'tba_deposit'
  )),
  payment_id TEXT,
  amount_micro BIGINT NOT NULL CHECK (amount_micro > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'depleted')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_lots_positive_amount CHECK (amount_micro > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_lots_payment_id_uq
  ON credit_lots(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_lots_community
  ON credit_lots(community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_lots_expiry
  ON credit_lots(expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- --- lot_entries (upstream 0009 + 0012 columns folded in) --------------------
CREATE TABLE IF NOT EXISTS lot_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES credit_lots(id),   -- nullable for governance_* entry types
  community_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'credit', 'debit', 'expiry', 'credit_back', 'governance_debit', 'governance_credit'
  )),
  amount_micro BIGINT NOT NULL CHECK (amount_micro > 0),
  reservation_id TEXT,
  usage_event_id TEXT,
  reference_id TEXT,
  correlation_id UUID DEFAULT gen_random_uuid(),   -- upstream 0012
  purpose TEXT,                                     -- upstream 0012 (TEXT form)
  sequence_number BIGINT,                           -- upstream 0012
  causation_id UUID,                                -- upstream 0012
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lot_entries_lot
  ON lot_entries(lot_id, entry_type);
CREATE INDEX IF NOT EXISTS idx_lot_entries_community
  ON lot_entries(community_id, created_at);
-- debit idempotency (upstream 0009)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_entries_reservation_lot
  ON lot_entries(lot_id, reservation_id)
  WHERE reservation_id IS NOT NULL AND entry_type = 'debit';
-- expiry idempotency (upstream 0012 — required by insert_lot_entry_fn expiry branch)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_entries_reservation_expiry
  ON lot_entries(lot_id, reservation_id)
  WHERE reservation_id IS NOT NULL AND entry_type = 'expiry';

-- --- append-only enforcement (upstream 0009 — KEPT; integrity mechanism) -----
CREATE TRIGGER credit_lots_no_update
    BEFORE UPDATE ON credit_lots
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER credit_lots_no_delete
    BEFORE DELETE ON credit_lots
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER lot_entries_no_update
    BEFORE UPDATE ON lot_entries
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER lot_entries_no_delete
    BEFORE DELETE ON lot_entries
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- --- lot_balances view (upstream 0009, verbatim) ----------------------------
CREATE OR REPLACE VIEW lot_balances AS
SELECT
    cl.id AS lot_id,
    cl.community_id,
    cl.source,
    cl.amount_micro AS original_micro,
    cl.status,
    cl.expires_at,
    cl.created_at,
    COALESCE(credits.total, 0) AS credited_micro,
    COALESCE(debits.total, 0) AS debited_micro,
    COALESCE(credits.total, 0) - COALESCE(debits.total, 0) AS remaining_micro
FROM credit_lots cl
LEFT JOIN (
    SELECT lot_id, SUM(amount_micro) AS total
    FROM lot_entries
    WHERE entry_type IN ('credit', 'credit_back')
    GROUP BY lot_id
) credits ON credits.lot_id = cl.id
LEFT JOIN (
    SELECT lot_id, SUM(amount_micro) AS total
    FROM lot_entries
    WHERE entry_type IN ('debit', 'expiry')
    GROUP BY lot_id
) debits ON debits.lot_id = cl.id;

-- --- app.update_lot_status (upstream 0009, verbatim) ------------------------
CREATE OR REPLACE FUNCTION app.update_lot_status(
    p_lot_id UUID,
    p_new_status TEXT
)
RETURNS VOID AS $$
BEGIN
    IF p_new_status NOT IN ('expired', 'depleted') THEN
        RAISE EXCEPTION 'Invalid lot status transition: %', p_new_status
            USING ERRCODE = 'P0003';
    END IF;
    ALTER TABLE credit_lots DISABLE TRIGGER credit_lots_no_update;
    UPDATE credit_lots
    SET status = p_new_status
    WHERE id = p_lot_id AND status = 'active';
    ALTER TABLE credit_lots ENABLE TRIGGER credit_lots_no_update;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- app.insert_lot_entry_fn (upstream 0012, verbatim) ----------------------
-- Canonical insert path used by src/adapters/storage/lot-entry-repository.ts.
-- NOTE: upstream 0012 pairs this with `REVOKE INSERT ON lot_entries FROM
-- arrakis_app` so the function (SECURITY DEFINER, table owner) is the only
-- write path. The REVOKE is STRIPPED here (no arrakis_app role); the function
-- is retained because the copied repository calls it by name.
CREATE OR REPLACE FUNCTION app.insert_lot_entry_fn(
    p_lot_id UUID,
    p_community_id UUID,
    p_entry_type TEXT,
    p_amount_micro BIGINT,
    p_reservation_id TEXT DEFAULT NULL,
    p_usage_event_id TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL,
    p_correlation_id UUID DEFAULT gen_random_uuid(),
    p_purpose TEXT DEFAULT NULL,
    p_sequence_number BIGINT DEFAULT NULL,
    p_causation_id UUID DEFAULT NULL,
    p_idempotent BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    IF p_entry_type NOT IN ('credit', 'debit', 'expiry', 'credit_back', 'governance_debit', 'governance_credit') THEN
        RAISE EXCEPTION 'Invalid entry_type: %. Must be one of: credit, debit, expiry, credit_back, governance_debit, governance_credit', p_entry_type
            USING ERRCODE = 'P0003';
    END IF;
    IF p_amount_micro <= 0 THEN
        RAISE EXCEPTION 'amount_micro must be positive, got: %', p_amount_micro
            USING ERRCODE = 'P0003';
    END IF;
    IF p_lot_id IS NULL AND p_entry_type NOT IN ('governance_debit', 'governance_credit') THEN
        RAISE EXCEPTION 'lot_id is required for entry_type: %', p_entry_type
            USING ERRCODE = 'P0003';
    END IF;

    IF p_idempotent AND p_reservation_id IS NOT NULL AND p_entry_type = 'debit' THEN
        INSERT INTO lot_entries (
            lot_id, community_id, entry_type, amount_micro,
            reservation_id, usage_event_id, reference_id,
            correlation_id, purpose, sequence_number, causation_id
        ) VALUES (
            p_lot_id, p_community_id, p_entry_type, p_amount_micro,
            p_reservation_id, p_usage_event_id, p_reference_id,
            p_correlation_id, p_purpose, p_sequence_number, p_causation_id
        )
        ON CONFLICT (lot_id, reservation_id)
            WHERE reservation_id IS NOT NULL AND entry_type = 'debit'
        DO NOTHING
        RETURNING id INTO new_id;
    ELSIF p_idempotent AND p_reservation_id IS NOT NULL AND p_entry_type = 'expiry' THEN
        INSERT INTO lot_entries (
            lot_id, community_id, entry_type, amount_micro,
            reservation_id, usage_event_id, reference_id,
            correlation_id, purpose, sequence_number, causation_id
        ) VALUES (
            p_lot_id, p_community_id, p_entry_type, p_amount_micro,
            p_reservation_id, p_usage_event_id, p_reference_id,
            p_correlation_id, p_purpose, p_sequence_number, p_causation_id
        )
        ON CONFLICT (lot_id, reservation_id)
            WHERE reservation_id IS NOT NULL AND entry_type = 'expiry'
        DO NOTHING
        RETURNING id INTO new_id;
    ELSE
        INSERT INTO lot_entries (
            lot_id, community_id, entry_type, amount_micro,
            reservation_id, usage_event_id, reference_id,
            correlation_id, purpose, sequence_number, causation_id
        ) VALUES (
            p_lot_id, p_community_id, p_entry_type, p_amount_micro,
            p_reservation_id, p_usage_event_id, p_reference_id,
            p_correlation_id, p_purpose, p_sequence_number, p_causation_id
        )
        RETURNING id INTO new_id;
    END IF;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
