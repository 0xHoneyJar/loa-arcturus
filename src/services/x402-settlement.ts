/**
 * ─────────────────────────────────────────────────────────────────────────
 * PROVENANCE — curated copy from loa-freeside (AGPL-3.0 → AGPL-3.0)
 *   upstream file:   packages/services/x402-settlement.ts
 *   upstream repo:   loa-freeside
 *   upstream commit: f0354ff14dff81ea1ed5189f6af00a0afcf068c3 (2026-06-08)
 *   copied:          2026-06-10, VERBATIM (unmodified) — loa-arcturus Sprint 1
 *   classification:  spec §2 curated-copy list (ROLE3-ORACLE-SPEC.md:60-68)
 *
 * AGPL-3.0 §5(a) change notice: this file is carried into loa-arcturus, a
 * derivative work. Modifications from the loa-freeside original are dated and
 * noted here:
 *   - 2026-06-10, Sprint 2 (Task 2.2, FR-3 "THE GAP"): settle() now persists the
 *     on-chain payer by inserting into x402_settlements (migration 0005)
 *     alongside the existing usage_events insert. This replaces the
 *     payer-discard behavior (proof.from was parsed but never durably stored).
 *     No other logic changed; the quote/mint/debit/credit-back flow is intact.
 *   - 2026-06-11, Sprint 4 (Task 4.2/4.3, FR-6): the usage_events INSERT now does
 *     `RETURNING event_id` (and reads rows[0].event_id) instead of `RETURNING id`.
 *     The canonical upstream PG schema (0011_usage_events_pg.sql, ported to
 *     migration 0004) names the primary key `event_id`; the copied `RETURNING id`
 *     referenced a non-existent column and raised `column "id" does not exist`
 *     the first time the real settle() JS path ran against a live Postgres (the
 *     acceptance harness). This aligns the copied writer to the sourced schema —
 *     the returned value is used only as the TEXT usage_event_id threaded into
 *     debitLots()/insertLotEntry(), so its identity is unchanged. OPEN-1.
 * The original loa-freeside header and body otherwise follow unmodified.
 * See NOTICE and PROVENANCE.md for the authoritative derivation record.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * x402 Settlement Service — Conservative-Quote-Settle
 *
 * Implements the x402 micropayment settlement pattern:
 *   1. Quote: Return max pool cost as price_micro
 *   2. Create: Mint credit lot (source='x402', amount_micro=quoted)
 *   3. Settle: After inference, debit actual cost from lot
 *   4. Credit-back: Credit remainder (quoted - actual) to lot
 *   5. Redis: Net credit adjustment = remainder
 *
 * Nonce replay prevention via webhook_events(provider='x402', event_id=nonce).
 *
 * @see SDD §4.3 x402 Conservative-Quote-Settle
 * @see Sprint 2, Task 2.3 (F-20)
 * @module packages/services/x402-settlement
 */

import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { mintCreditLot, debitLots } from './credit-lot-service.js';
import { withCommunityScope } from './community-scope.js';
import { insertLotEntry } from '../adapters/storage/lot-entry-repository.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Quote response for x402 pricing */
export interface X402Quote {
  /** Price in micro-USD (max pool cost) */
  price_micro: bigint;
  /** Agent pool the quote applies to */
  pool: string;
  /** Quote validity in seconds */
  valid_for_s: number;
  /** Nonce for replay prevention */
  nonce: string;
  /** ISO timestamp of quote creation */
  created_at: string;
}

/** x402 payment proof from the client */
export interface X402PaymentProof {
  /** Transaction hash */
  tx_hash: string;
  /** Chain ID (e.g., 8453 for Base) */
  chain_id: number;
  /** Payer address */
  from: string;
  /** Amount in micro-USD */
  amount_micro: bigint;
  /** Nonce from the quote */
  nonce: string;
  /** Target agent ID */
  agent_id: string;
  /** Community ID */
  community_id: string;
}

/** Settlement result after inference completes */
export interface X402SettlementResult {
  /** Whether settlement succeeded */
  success: boolean;
  /** Lot ID created for this payment */
  lot_id: string;
  /** Quoted amount (max) in micro-USD */
  quoted_micro: bigint;
  /** Actual cost in micro-USD */
  actual_micro: bigint;
  /** Credited back in micro-USD (quoted - actual) */
  credited_back_micro: bigint;
  /** Usage event ID */
  usage_event_id: string;
}

/** Pool cost configuration */
export interface PoolCostConfig {
  /** Pool identifier */
  pool_id: string;
  /** Maximum cost per request in micro-USD */
  max_cost_micro: bigint;
  /** Typical cost per request in micro-USD (for estimates) */
  typical_cost_micro: bigint;
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Quote validity: 5 minutes */
const QUOTE_VALIDITY_S = 300;

/** 1 cent = 10,000 micro-USD */
const MICRO_PER_CENT = 10_000n;

/** Redis processed key TTL: 24 hours */
const REDIS_PROCESSED_TTL = 86_400;

/** Lot expiry for x402 lots: 24 hours (short-lived micropayments) */
const X402_LOT_EXPIRY_HOURS = 24;

// --------------------------------------------------------------------------
// Quote
// --------------------------------------------------------------------------

/**
 * Generate an x402 quote for a pool.
 *
 * Returns the maximum cost for the pool, which the client pays upfront.
 * After inference, the actual cost is settled and the remainder credited back.
 *
 * @param poolCosts - Map of pool_id → cost config
 * @param poolId - Pool to quote for
 * @returns Quote with price and nonce
 */
export function generateQuote(
  poolCosts: Map<string, PoolCostConfig>,
  poolId: string,
): X402Quote {
  const config = poolCosts.get(poolId);
  if (!config) {
    throw new Error(`Unknown pool: ${poolId}`);
  }

  // Generate cryptographic nonce for replay prevention
  const nonce = crypto.randomUUID();

  return {
    price_micro: config.max_cost_micro,
    pool: poolId,
    valid_for_s: QUOTE_VALIDITY_S,
    nonce,
    created_at: new Date().toISOString(),
  };
}

// --------------------------------------------------------------------------
// Proof Verification
// --------------------------------------------------------------------------

/**
 * Verify x402 payment proof nonce hasn't been replayed.
 *
 * Uses webhook_events(provider='x402', event_id=nonce) for durable dedup.
 *
 * @param pool - PostgreSQL pool
 * @param nonce - Payment proof nonce
 * @returns true if nonce is fresh, false if replayed
 */
export async function verifyNonceUnique(
  clientOrPool: Pool | PoolClient,
  nonce: string,
): Promise<boolean> {
  const result = await clientOrPool.query<{ id: string }>(
    `INSERT INTO webhook_events (provider, event_id, event_type, payload, processed_at)
     VALUES ('x402', $1, 'payment_proof', '{}', NOW())
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [nonce],
  );

  return result.rows.length > 0;
}

// --------------------------------------------------------------------------
// Settlement
// --------------------------------------------------------------------------

/**
 * Execute the conservative-quote-settle pattern.
 *
 * Steps:
 *   1. Verify nonce uniqueness (replay prevention)
 *   2. Mint credit lot (source='x402', amount=quoted, payment_id=tx_hash)
 *   3. Redis INCRBY budget limit (conditional on mint)
 *   4. Debit actual cost from lot
 *   5. Credit-back remainder
 *   6. Redis DECRBY to return remainder
 *
 * @param pgPool - PostgreSQL connection pool
 * @param redis - Redis client
 * @param proof - Verified payment proof
 * @param quotedMicro - Original quoted amount
 * @param actualMicro - Actual inference cost
 * @param reservationId - Budget reservation ID
 * @returns Settlement result
 */
export async function settle(
  pgPool: Pool,
  redis: Redis,
  proof: X402PaymentProof,
  quotedMicro: bigint,
  actualMicro: bigint,
  reservationId: string,
): Promise<X402SettlementResult> {
  if (actualMicro > quotedMicro) {
    throw new Error(
      `Actual cost ${actualMicro} exceeds quoted ${quotedMicro} — ` +
      `conservative-quote-settle invariant violated`,
    );
  }

  // Use withCommunityScope for standardized BEGIN/SET LOCAL/COMMIT (Sprint 1, Task 1.1)
  // This also fixes a pre-existing bug: mintCreditLot previously ran without community scope set.
  const txResult = await withCommunityScope(proof.community_id, pgPool, async (client) => {
    // Step 1: Verify nonce inside transaction (rolls back on settlement failure)
    const nonceUnique = await verifyNonceUnique(client, proof.nonce);
    if (!nonceUnique) {
      throw new Error(`x402 nonce replay detected: ${proof.nonce}`);
    }

    // Step 2: Mint credit lot (idempotent via tx_hash as payment_id)
    const expiresAt = new Date(Date.now() + X402_LOT_EXPIRY_HOURS * 60 * 60 * 1000);

    const mintedLotId = await mintCreditLot(client, {
      community_id: proof.community_id,
      source: 'x402',
      amount_micro: quotedMicro,
      payment_id: proof.tx_hash,
      expires_at: expiresAt,
    });

    if (!mintedLotId) {
      throw new Error(`x402 payment already settled: ${proof.tx_hash}`);
    }

    // Step 3: Insert usage_event for the actual cost.
    // RETURNING event_id: the canonical PK name in the sourced schema (migration
    // 0004 / upstream 0011_usage_events_pg.sql). See the §5(a) notice above.
    const usageResult = await client.query<{ event_id: string }>(
      `INSERT INTO usage_events (community_id, amount_micro, source, reference_id, created_at)
       VALUES ($1, $2, 'x402', $3, NOW())
       RETURNING event_id`,
      [proof.community_id, actualMicro.toString(), proof.tx_hash],
    );
    const eventId = usageResult.rows[0].event_id;

    // Step 3b: Persist the on-chain payer (FR-3 "THE GAP", Sprint 2 Task 2.2).
    // The payer address (proof.from) is the anti-sybil trust anchor the oracle
    // profiles in Sprint 3 — it must be durably stored, not discarded. Every
    // field is already carried by the proof / settle() args (no new lookups).
    // UNIQUE(chain_id, tx_hash) rejects double-counting: a replayed tx raises
    // and rolls back the whole settlement rather than counting revenue twice.
    await client.query(
      `INSERT INTO x402_settlements
         (community_id, agent_id, payer_address, chain_id, tx_hash, nonce, quoted_micro, actual_micro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        proof.community_id,
        proof.agent_id,
        proof.from,
        proof.chain_id,
        proof.tx_hash,
        proof.nonce,
        quotedMicro.toString(),
        actualMicro.toString(),
      ],
    );

    // Step 4: Debit actual cost from the lot
    await debitLots(client, proof.community_id, actualMicro, reservationId, eventId);

    // Step 5: If there's a remainder (quoted > actual), record credit-back entry
    const remainder = quotedMicro - actualMicro;

    if (remainder > 0n) {
      await insertLotEntry(client, {
        lotId: mintedLotId,
        communityId: proof.community_id,
        entryType: 'credit_back',
        amountMicro: remainder,
        referenceId: `x402:creditback:${proof.tx_hash}`,
      });
    }

    return { lotId: mintedLotId, usageEventId: eventId };
  });

  const lotId = txResult.lotId;
  const usageEventId = txResult.usageEventId;

  // Step 6: Redis budget adjustment (best-effort)
  const creditedBack = quotedMicro - actualMicro;

  try {
    const processedKey = `processed:x402:${lotId}`;
    const alreadyProcessed = await redis.exists(processedKey);

    if (!alreadyProcessed) {
      // Net effect on Redis limit:
      // +quotedMicro (lot mint) then -actualMicro (debit) = +remainder
      // But since we haven't added quotedMicro to limit yet during x402 flow,
      // we only add the actual cost that was reserved, then the remainder stays
      // as available credit. Simpler: add full quoted amount to limit.
      const quotedCents = quotedMicro / MICRO_PER_CENT;

      await redis.incrby(
        `agent:budget:limit:${proof.community_id}`,
        Number(quotedCents),
      );

      await redis.set(processedKey, '1', 'EX', REDIS_PROCESSED_TTL);
    }
  } catch {
    // Redis failure is non-fatal — reconciliation sweep will catch up
  }

  return {
    success: true,
    lot_id: lotId,
    quoted_micro: quotedMicro,
    actual_micro: actualMicro,
    credited_back_micro: creditedBack,
    usage_event_id: usageEventId,
  };
}
