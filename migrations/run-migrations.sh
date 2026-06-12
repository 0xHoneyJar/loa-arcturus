#!/usr/bin/env bash
# =============================================================================
# loa-arcturus — clean-DB migration verification harness
# =============================================================================
# Applies migrations 0001..0005 IN ORDER against a clean PostgreSQL database and
# fails loudly on the first error. This is the command referenced by Sprint 1
# acceptance criterion "docker compose up runs every migration with no
# missing-function/role errors".
#
# Sprint 2 (2026-06-10) added 0005_x402_settlements.sql (THE GAP / payer
# persistence) and verified the FULL 0001->0005 chain green on a live clean
# Postgres 16 — including the new UNIQUE(chain_id, tx_hash) replay guard and the
# append-only triggers. The smoke test below now also drives the x402_settlements
# insert that settle() performs.
#
# Usage:
#   # against a throwaway local Postgres (recommended):
#   docker run --rm -d --name arcturus-pg -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16
#   DATABASE_URL="postgres://postgres:pg@localhost:5433/postgres" ./migrations/run-migrations.sh
#   docker rm -f arcturus-pg
#
#   # or against any reachable clean DB:
#   DATABASE_URL="postgres://user:pass@host:5432/dbname" ./migrations/run-migrations.sh
# =============================================================================
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to a clean Postgres database}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "Applying loa-arcturus migrations to: ${DATABASE_URL%%\?*}"
for f in 0001_foundation.sql 0002_credit_lots_lot_entries.sql \
         0003_webhook_events.sql 0004_usage_events.sql \
         0005_x402_settlements.sql; do
  echo "  -> $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/$f"
done

echo
echo "Smoke test: drive the real settle() insert shapes (single-tenant)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
SET LOCAL app.community_id = '00000000-0000-0000-0000-000000000001';

-- (1) nonce dedup — exactly what verifyNonceUnique() runs
INSERT INTO webhook_events (provider, event_id, event_type, payload, processed_at)
VALUES ('x402', 'nonce-smoke-1', 'payment_proof', '{}', NOW())
ON CONFLICT (provider, event_id) DO NOTHING;

-- (2) mint credit lot — exactly what mintCreditLot() runs
INSERT INTO credit_lots (community_id, source, payment_id, amount_micro, expires_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'x402', '0xtxsmoke', 1000000, NOW() + INTERVAL '24 hours');

-- (3) usage_event — exactly what settle() runs (the reconciled columns)
INSERT INTO usage_events (community_id, amount_micro, source, reference_id, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 900000, 'x402', '0xtxsmoke', NOW());

-- (3b) x402_settlements — exactly what settle() Step 3b runs (Sprint 2, THE GAP).
-- payer_address = proof.from is now persisted, unblocking Qualified Revenue.
INSERT INTO x402_settlements
  (community_id, agent_id, payer_address, chain_id, tx_hash, nonce, quoted_micro, actual_micro)
VALUES ('00000000-0000-0000-0000-000000000001', 'agent-smoke',
        '0xpayer_smoke', 80069, '0xtxsmoke', 'nonce-smoke-1', 1000000, 900000);

-- (4) canonical lot entry insert — exactly what insertLotEntry() calls
SELECT app.insert_lot_entry_fn(
  (SELECT id FROM credit_lots WHERE payment_id = '0xtxsmoke'),
  '00000000-0000-0000-0000-000000000001',
  'credit_back', 100000, NULL, NULL, 'x402:creditback:0xtxsmoke',
  gen_random_uuid(), NULL, NULL, NULL, FALSE
);

-- (5) Raw Revenue is computable end-to-end
SELECT 'raw_revenue_micro' AS metric, COALESCE(SUM(amount_micro),0) AS value
FROM usage_events WHERE source = 'x402';

-- (6) Payer is persisted (Qualified-Revenue precondition): the oracle can now
-- join revenue to the on-chain payer it will profile in Sprint 3.
SELECT 'payer_persisted' AS metric, payer_address
FROM x402_settlements WHERE tx_hash = '0xtxsmoke';
ROLLBACK;
SQL

echo
echo "OK — all migrations applied and the real settle() insert shapes succeed."
