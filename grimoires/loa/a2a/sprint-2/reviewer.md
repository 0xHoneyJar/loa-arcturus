# Implementation Report — Sprint 2

**Sprint:** sprint-2 (The Gap (Payer Persistence) + Bepolia Config)
**Role:** implement
**Date:** 2026-06-10
**Epic:** loa-arcturus-ict
**Spec (authoritative):** ROLE3-ORACLE-SPEC.md §3 (THE GAP), §4 (Bepolia/HONEY)
**SDD:** §3.2 (Option B), §5.2 (settle() write), §5.3 (CHAIN_CONFIGS)

---

## Summary

Sprint 2 closes **THE GAP** (FR-3): the on-chain payer is now durably persisted
on every settlement, unblocking Qualified Revenue (Sprint 3). It also makes the
x402 facilitator **config-driven** and adds **Bepolia 80069** to `CHAIN_CONFIGS`
(FR-4). The full migration chain **0001→0005 was run LIVE against a clean
Postgres 16 and applies green** — including the new `UNIQUE(chain_id, tx_hash)`
replay guard and append-only triggers (unlike Sprint 1, whose live run was
environment-deferred).

No fee/treasury/PoL code introduced. Self-broadcast model preserved. The HONEY
token standard remains **UNVERIFIED** — recorded as an explicit confirm task, not
guessed.

---

## Files created / modified

| File | Change | Task |
|------|--------|------|
| `migrations/0005_x402_settlements.sql` | **NEW** — Option B payer-persistence table | 2.1 |
| `src/services/x402-settlement.ts` | **MOD** — `settle()` inserts into `x402_settlements`; AGPL §5(a) change notice updated | 2.2 |
| `src/core/ports/chain-provider.ts` | **MOD** — added `bepolia` (80069) to `CHAIN_CONFIGS`; §5(a) notice updated | 2.3 |
| `src/routes/x402.routes.ts` | **MOD** — config-driven facilitator (`chainKey`/`settlementToken`); removed base/USDC/8453 literals; §5(a) notice updated | 2.4 |
| `migrations/run-migrations.sh` | **MOD** — chain extended to 0005; smoke test drives the x402_settlements insert + payer-persisted check | 2.1/2.2 |
| `docs/SETTLEMENT-MODEL.md` | **NEW** — self-broadcast model + HONEY UNVERIFIED confirm task + confirmed Bepolia params | 2.5 |

---

## Task detail

### Task 2.1 — `x402_settlements` migration (0005)
Authored per SDD §3.2 Option B verbatim: `payer_address TEXT NOT NULL` (= proof.from),
`chain_id`, `tx_hash`, `nonce`, `quoted_micro`/`actual_micro` as `NUMERIC(30,0)`,
`UNIQUE (chain_id, tx_hash)`, indexes `idx_x402_settlements_payer` and
`idx_x402_settlements_agent (agent_id, settled_at)`. Added (beyond the bare
spec DDL, justified): `CHECK (… >= 0)` on the micro columns (no negative
revenue) and append-only `prevent_mutation()` triggers (the ledger-integrity
mechanism kept on all four Sprint-1 tables — a settlements ledger must be
immutable). Every column traces to the Option B DDL + the `X402PaymentProof`
fields already in memory — no invention. Provenance header in the migration.

### Task 2.2 — `settle()` persists the payer
Added a `Step 3b` INSERT into `x402_settlements` **inside the existing
`withCommunityScope` transaction**, immediately after the `usage_events` insert
(SDD §5.2). All 8 values come from `proof` / `settle()` args already in memory
(`proof.from`, `proof.chain_id`, `proof.tx_hash`, `proof.nonce`,
`proof.agent_id`, `proof.community_id`, `quotedMicro`, `actualMicro`) — no new
chain reads. Because it shares the transaction, a `UNIQUE(chain_id, tx_hash)`
violation rolls back the whole settlement (no half-counted revenue). This
**replaces** the prior payer-discard behavior; the file's AGPL §5(a) notice was
updated from "verbatim" to a dated change record (provenance honesty).

### Task 2.3 — Bepolia 80069 ChainConfig
Added `bepolia` to `CHAIN_CONFIGS`. **OPEN-6 confirmed against a real source** —
the canonical ethereum-lists EVM chain registry (`chainid.network/chains.json`,
entry chainId 80069): name "Berachain Bepolia", symbol **BERA**, decimals **18**,
RPC `https://bepolia.rpc.berachain.com`, explorer `https://bepolia.beratrail.io`
(matches spec §4). `isTestnet: true`. Berachain mainnet **80094 retained**
unchanged. Nothing guessed.

### Task 2.4 — config-driven facilitator
Replaced `chainId?: number` (default 8453) with `chainKey?: string` (default
`'bepolia'`, resolved from `CHAIN_CONFIGS`) + `settlementToken?: string`
(default `'HONEY'`, `'USDC'` accepted). Both inline facilitator blocks (the
`/quote` 200 and the 402 response) now emit a single `facilitatorDescriptor`
built from config. **Zero `'base'`/`'USDC'`/`8453` literals remain on the
facilitator path** (verified by `ck`). `settlementToken` is a **display symbol
string only** — not a contract address or token interface — so it makes no HONEY
standard assumption.

### Task 2.5 — self-broadcast doc + HONEY UNVERIFIED
`docs/SETTLEMENT-MODEL.md` documents the self-broadcast model (on-chain `from` ==
real payer = anti-sybil anchor; relayer-masking risk carried to the Sprint 4
PROOF-SCHEMA seam) and records the **HONEY token standard / Bepolia contract
address as UNVERIFIED** with an explicit confirm-against-source task (OPEN-2).
The only sourced statement ("Honey and USDC have the functionality required for
x402", no EIP named) is quoted; the unsourced EIP-3009/2612 claim is flagged.
PoC is not blocked because self-broadcast uses plain transfers.

---

## LIVE DB verification (the Sprint-2 mandate — NOT deferred)

Ran the full chain **0001→0005** against a throwaway **Postgres 16** in Docker
(`docker run … postgres:16`, applied each file with `psql -v ON_ERROR_STOP=1`).

**Result: GREEN.** All 5 migrations applied with no missing-function/role/column
errors. Then verified in the live DB:

- `\d x402_settlements`: all 10 columns present incl. `payer_address TEXT NOT
  NULL`; `x402_settlements_chain_tx_uq UNIQUE (chain_id, tx_hash)`; both indexes;
  both append-only triggers; both `>= 0` CHECKs.
- **Double-count rejected:** a second insert with the same `(80069, tx_hash)`
  raised `duplicate key value violates unique constraint
  x402_settlements_chain_tx_uq` — exactly the anti-double-count guarantee.
- **Per-chain uniqueness:** the same `tx_hash` on chain `80094` inserted fine.
- **Append-only enforced:** UPDATE and DELETE both raised `x402_settlements is
  append-only: … not permitted` (prevent_mutation).
- **Full settle() path** (nonce dedup → mint → usage_event → **x402_settlements**
  → canonical lot entry) ran green end-to-end inside one transaction; payer
  joinable to revenue.
- Re-ran the **updated `run-migrations.sh` smoke SQL** on a second fresh DB →
  exit 0 (`raw_revenue_micro=900000`, `payer_persisted=0xpayer_smoke`).

Both throwaway containers were torn down (`docker rm -f`). No persistent DB left.

> Caveat (honest): `node_modules` is not installed in this environment, so a
> live `tsc --noEmit` / `vitest` was not run (same limitation Sprint 1 recorded
> for typecheck). The DB-level behavior — the substantive Sprint-2 gate — IS
> live-verified. The import path added (`../core/ports/chain-provider.js`) is
> within the settle() subgraph Sprint 1 confirmed import-closed.

---

## AC Verification (sprint.md:100-106)

| AC | Status | Evidence |
|----|--------|----------|
| Migration creates `x402_settlements` per SDD §3.2 Option B | ✓ Met | `migrations/0005`; live `\d` matches Option B |
| Every settlement persists `payer_address`; no payer discarded | ✓ Met | `settle()` Step 3b; live e2e shows `payer_persisted` |
| `UNIQUE(chain_id, tx_hash)` rejects double-counting | ✓ Met | live duplicate-key rejection observed |
| Bepolia present (80069, RPC, explorer); 80094 retained; token supports HONEY/USDC | ✓ Met | `CHAIN_CONFIGS.bepolia`; `settlementToken` HONEY/USDC |
| No base/USDC/8453 literals on facilitator path | ✓ Met | `ck` finds only change-notice/comment refs |
| HONEY standard/contract recorded as UNVERIFIED confirm task, not guessed | ✓ Met | `docs/SETTLEMENT-MODEL.md` §2; OPEN-2 |

---

## Guardrail compliance

- **Read-only / fee-free / PoL-free:** no fee/treasury/PoL/emission code added.
- **`../loa-freeside` untouched:** read-only; zero writes to any sibling repo.
- **No git ops:** no stage/commit/push/PR/branch. All new files untracked (`??`).
  `br` beads writes only. Human stages.
- **Provenance honesty:** Bepolia params sourced from ethereum-lists registry;
  HONEY left UNVERIFIED; modified copied files' §5(a) notices updated from
  "verbatim" to dated change records.
- **Sprint 2 ONLY:** no oracle module, no filters, no realness score (Sprint 3
  not started).
