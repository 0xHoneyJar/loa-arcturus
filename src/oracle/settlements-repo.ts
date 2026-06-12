/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, Task 3.1, FR-5) — NOT a loa-freeside copy.
 *
 * Settlements repository — the oracle's read side over `x402_settlements`
 * (migration 0005). The oracle NEVER writes; this module is read-only by design
 * (ROLE3-ORACLE-SPEC.md:11-16 — read-only measurement layer).
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Pool } from 'pg';
import type { SettlementRow } from './types.js';

/** Read side of x402_settlements. Implemented over pg.Pool; mockable in tests. */
export interface SettlementsRepo {
  /** Distinct service ids (agent_id) present in the window — every service is indexed. */
  listAgentIds(window?: TimeWindow): Promise<string[]>;
  /** All settlements for a service within the window, ordered deterministically. */
  settlementsForAgent(agentId: string, window?: TimeWindow): Promise<SettlementRow[]>;
}

/** Optional [from,to) settlement-time window. Omit for all-time. */
export interface TimeWindow {
  from?: Date;
  to?: Date;
}

/** Postgres-backed SettlementsRepo. */
export class PgSettlementsRepo implements SettlementsRepo {
  constructor(private readonly pool: Pool) {}

  async listAgentIds(window?: TimeWindow): Promise<string[]> {
    const { clause, params } = windowClause(window, 1);
    const res = await this.pool.query<{ agent_id: string }>(
      `SELECT DISTINCT agent_id FROM x402_settlements ${clause} ORDER BY agent_id`,
      params,
    );
    return res.rows.map((r) => r.agent_id);
  }

  async settlementsForAgent(agentId: string, window?: TimeWindow): Promise<SettlementRow[]> {
    const { clause, params } = windowClause(window, 2);
    // agent_id is $1; window params follow from $2 (see windowClause start index).
    const res = await this.pool.query<{
      agent_id: string;
      payer_address: string;
      chain_id: number;
      tx_hash: string;
      actual_micro: string; // NUMERIC(30,0) arrives as string from pg
      settled_at: Date;
    }>(
      `SELECT agent_id, payer_address, chain_id, tx_hash, actual_micro, settled_at
         FROM x402_settlements
        WHERE agent_id = $1 ${clause}
        ORDER BY settled_at ASC, tx_hash ASC`,
      [agentId, ...params],
    );
    return res.rows.map((r) => ({
      agent_id: r.agent_id,
      payer_address: r.payer_address,
      chain_id: r.chain_id,
      tx_hash: r.tx_hash,
      actual_micro: BigInt(r.actual_micro),
      settled_at: r.settled_at,
    }));
  }
}

/** Build an optional settled_at window SQL clause starting at parameter $startIdx. */
function windowClause(
  window: TimeWindow | undefined,
  startIdx: number,
): { clause: string; params: Date[] } {
  if (!window || (!window.from && !window.to)) return { clause: '', params: [] };
  const parts: string[] = [];
  const params: Date[] = [];
  let idx = startIdx;
  if (window.from) {
    parts.push(`settled_at >= $${idx++}`);
    params.push(window.from);
  }
  if (window.to) {
    parts.push(`settled_at < $${idx++}`);
    params.push(window.to);
  }
  // When the caller already has a WHERE (settlementsForAgent), prefix AND.
  const keyword = startIdx === 1 ? 'WHERE' : 'AND';
  return { clause: `${keyword} ${parts.join(' AND ')}`, params };
}
