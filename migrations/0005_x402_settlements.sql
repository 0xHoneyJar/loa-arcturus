-- =============================================================================
-- loa-arcturus migration 0005 — x402_settlements (THE GAP: payer persistence)
-- =============================================================================
-- Sprint 2, Task 2.1 (FR-3). NET-NEW table — NOT a loa-freeside copy.
--
-- WHY THIS EXISTS (the verified gap, ROLE3-ORACLE-SPEC.md:74-80):
--   The payer address `from` is parsed + validated in x402.routes.ts but NEVER
--   durably persisted. verifyNonceUnique() writes webhook_events.payload = '{}'
--   (proof discarded); usage_events stores community_id/amount_micro/source/
--   reference_id but NO payer. So Raw Revenue is computable today, but QUALIFIED
--   Revenue — which the oracle (Sprint 3) computes by profiling the payer wallet
--   — is impossible without the payer wallet. This table closes that gap and
--   blocks everything downstream (spec §3, line 82).
--
-- DESIGN: Option B (queryable table), per SDD §3.2 and ROLE3-ORACLE-SPEC.md:94-112.
--   Adopted over Option A (full proof JSONB in webhook_events.payload) because
--   the oracle queries by `payer_address` and by `(agent_id, window)`; Option A
--   would force JSON extraction on every oracle read. Decision recorded in
--   grimoires/loa/NOTES.md Decision Log (Sprint 1) and sdd.md:178.
--
-- SCHEMA PROVENANCE: every column below is lifted DIRECTLY from the Option B
--   DDL in the spec/SDD and the X402PaymentProof fields the copied settle()
--   already holds in memory (src/services/x402-settlement.ts:60-75) — nothing
--   invented:
--     payer_address  <- proof.from        (the missing piece)
--     chain_id       <- proof.chain_id
--     tx_hash        <- proof.tx_hash
--     nonce          <- proof.nonce
--     agent_id       <- proof.agent_id
--     community_id   <- proof.community_id
--     quoted_micro   <- settle() quotedMicro arg
--     actual_micro   <- settle() actualMicro arg (real settled revenue)
--
-- ANTI-DOUBLE-COUNT / REPLAY: UNIQUE (chain_id, tx_hash). One on-chain tx settles
--   exactly once per chain; a replayed tx_hash is rejected at the DB. This is the
--   second replay guard behind the existing webhook_events nonce dedup
--   (verifyNonceUnique), and the one the oracle's revenue sums rely on.
--
-- MONETARY TYPE: NUMERIC(30,0) micro-USD (no floating point in the economic
--   path), matching the Option B DDL and loa-freeside ledger discipline
--   (sdd.md:150). usage_events keeps its upstream BIGINT amount_micro; this
--   net-new table follows the spec's Option B which specifies NUMERIC(30,0).
--
-- APPEND-ONLY: prevent_mutation() triggers (defined in 0001, used by all four
--   Sprint-1 tables) are applied here too. A settlements ledger must never be
--   mutated or deleted after the fact — same integrity property the credit_lots /
--   lot_entries / webhook_events / usage_events ledgers rely on.
--
-- RLS / tenant roles: NOT added, consistent with the Sprint-1 strip-down
--   (single-tenant, read-only PoC; roles arrakis_app/arrakis_admin do not exist
--   on a clean DB). See migrations/PROVENANCE.md.
-- =============================================================================

CREATE TABLE IF NOT EXISTS x402_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  payer_address TEXT NOT NULL,              -- the missing piece: proof.from (on-chain payer)
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  quoted_micro NUMERIC(30,0) NOT NULL CHECK (quoted_micro >= 0),
  actual_micro NUMERIC(30,0) NOT NULL CHECK (actual_micro >= 0),  -- real settled revenue
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT x402_settlements_chain_tx_uq UNIQUE (chain_id, tx_hash)  -- rejects double-counting
);

-- Oracle access patterns (sdd.md §3.4):
--   * filter lookups by payer_address (per settlement)
CREATE INDEX IF NOT EXISTS idx_x402_settlements_payer
  ON x402_settlements(payer_address);
--   * revenue per agent over a window (per verify)
CREATE INDEX IF NOT EXISTS idx_x402_settlements_agent
  ON x402_settlements(agent_id, settled_at);

-- Append-only enforcement (prevent_mutation() from 0001 — KEPT, ledger integrity)
CREATE TRIGGER x402_settlements_no_update
    BEFORE UPDATE ON x402_settlements
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER x402_settlements_no_delete
    BEFORE DELETE ON x402_settlements
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
