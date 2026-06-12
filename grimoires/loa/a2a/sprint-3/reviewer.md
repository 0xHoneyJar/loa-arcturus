# Implementation Report — Sprint 3

**Sprint:** sprint-3 (The Oracle — Qualified Revenue Ruleset & Realness Score)
**Role:** implement
**Date:** 2026-06-11
**Epic:** loa-arcturus-6ip
**Spec (authoritative):** ROLE3-ORACLE-SPEC.md §5 (ruleset & score), §9, §10.5 (mock)
**SDD:** §4 (oracle), §5.1 (module shape)

---

## Summary

Sprint 3 delivers the **net-new Oracle module** (FR-5): per service it computes
**Raw Revenue**, **Qualified Revenue**, and a **realness score ∈ [0,1]** from the
§5 five-filter stack, reading the real `x402_settlements` table (migration 0005)
and an `IChainProvider`. Anti-self-grading is enforced — every service is held to
the same filters, affiliated revenue is labeled (`flagged_affiliated_micro`) and
EXCLUDED from the headline. A keyless, deterministic `MockChainProvider` lets the
full filter logic run with zero API keys.

The oracle was **live-verified against a real Postgres 16** (throwaway Docker
container, migrations 0001→0005 applied green): synthetic clean + farm-like +
affiliated settlements were written through the same columns `settle()` writes,
scored, and the output matched the spec shape. **Farm-reduces-score and
clean-survives are demonstrated with actual numbers; determinism is byte-identical
across two separate process runs.**

No fee/treasury/PoL/emission code. Read-only posture preserved. OPEN-3/4/5
resolved honestly — placeholders, documented tunables, written-down reconciliation;
nothing invented.

---

## Files created / modified

| File | Change | Task |
|------|--------|------|
| `src/oracle/types.ts` | **NEW** — settlement row, payer profile, classified settlement, `Methodology`, `ServiceRevenue` output shapes | 3.1 |
| `src/oracle/settlements-repo.ts` | **NEW** — read-only `x402_settlements` repo (`PgSettlementsRepo`) + `SettlementsRepo` interface | 3.1 |
| `src/oracle/oracle.ts` | **NEW** — `computeServiceRevenue()` / `computeAllServices()`; filter orchestration + score | 3.1, 3.6 |
| `src/oracle/config.ts` | **NEW** — OPEN-3 allowlist resolver, OPEN-4 dust floor, OPEN-5 weighting params (all config-driven) | 3.2, 3.3, 3.5 |
| `src/oracle/funding-graph.ts` | **NEW** — directed funding graph + circular-flow cycle detection (acknowledged NET-NEW) + age/external-origin profiling | 3.4, 3.5 |
| `src/adapters/chain/mock-chain-provider.ts` | **NEW** — keyless deterministic `IChainProvider` over a synthetic graph (`CHAIN_PROVIDER=mock`) | 3.7 |
| `src/oracle/synthetic-graph.ts` | **NEW** — fixed synthetic funding graph + labeled synthetic addresses (proof fixture) | 3.7 |
| `src/oracle/oracle.test.ts` | **NEW** — 10 unit + determinism tests (all 5 filters, anti-self-grading, farm-reduces, byte-identical reruns) | 3.1–3.7 |
| `src/oracle/verify-live.ts` | **NEW** — live-DB driver: inserts synthetic settlements into real PG, scores, prints headline + anti-self-grading + determinism | 3.1–3.7 |
| `src/oracle/index.ts` | **NEW** — public module surface | 3.1 |
| `docs/ORACLE-METHODOLOGY.md` | **NEW** — open, reproducible methodology; OPEN-3/4/5 rationale; live numbers; reproduce-it-yourself steps | 3.2/3.3/3.5/3.6 |

---

## Task detail

### Task 3.1 — Oracle module skeleton + `computeServiceRevenue()` (Raw Revenue)
`src/oracle/oracle.ts` reads `x402_settlements` via `SettlementsRepo`
(`settlements-repo.ts`, Postgres-backed, **read-only by design** — the oracle never
writes). `computeServiceRevenue(agentId, deps, window?)` sums `actual_micro` →
`raw_micro`, then applies the filter stack. `computeAllServices()` indexes EVERY
`agent_id` in the window (sorted, deterministic). Output shape per SDD §5.1:
`{ agent_id, raw_micro, qualified_micro, score, flagged_affiliated_micro, methodology }`.

### Task 3.2 — Filter 1 affiliate exclusion (flag-not-count) — OPEN-3
Binary gate: a settlement whose normalized `payer_address` ∈ the allowlist is
dropped and its revenue attributed to `flagged_affiliated_micro` (never to
qualified). **OPEN-3 resolved config-driven with PLACEHOLDERS only**
(`config.ts` `PLACEHOLDER_AFFILIATE_ALLOWLIST`): `0x0000…0000`
(`PLACEHOLDER_HONEYJAR_TREASURY`) and `0x0000…dead` (`PLACEHOLDER_OPERATOR_WALLET`),
both intentionally unmatchable so until a maintainer replaces them Filter 1 is a
no-op rather than mis-flagging a real payer. Runtime overrides:
`AFFILIATE_ALLOWLIST` (CSV) or `AFFILIATE_ALLOWLIST_FILE` (one per line, `#`
comments). **No real address invented** — provenance rule documented in code +
`docs/ORACLE-METHODOLOGY.md` §3.

### Task 3.3 — Filter 2 dust floor — OPEN-4
Binary gate: `actual_micro < dustFloorMicro` drops (strict less-than; exactly-floor
kept). **OPEN-4 default = `10_000` micro-USD = $0.01**, documented with reasoning
(matches loa-freeside `MICRO_PER_CENT`; one cent is the smallest unit settle math
reasons in; removes cheapest wash-farm vector). **Tunable** via `DUST_FLOOR_MICRO`
(0 disables; negatives rejected loudly). Not a magic literal — `DEFAULT_DUST_FLOOR_MICRO`
+ rationale in `config.ts` and `docs/ORACLE-METHODOLOGY.md` §4.

### Task 3.4 — Filter 3 circular-flow detection (NET-NEW)
`src/oracle/funding-graph.ts` calls `IChainProvider.getActivity` (optional /
Dune-exclusive; mock implements it), builds a directed funding graph (edge A→B =
A sent value to B), and detects whether a payer sits on a cycle: some X≠payer both
reachable FROM payer and able to reach BACK to payer (forward reach set + reverse
BFS over the transpose). For an x402 payer this is exactly "funded by / routes back
to the recipient service wallet" (`ROLE3-ORACLE-SPEC.md:153-154`). **Explicitly
marked NET-NEW** in code headers and in the emitted methodology (`net_new: true`) —
not claimed as inherited from loa-freeside (per spec :301-305).

### Task 3.5 — Filters 4-5 wallet-age weighting + external-origin bonus — OPEN-5
`funding-graph.ts` profiles each payer's wallet age (relative to `asOf`) and
external origin (first inbound funding labeled cex/bridge/exchange/onramp/defi).
**OPEN-5 reconciliation (the headline stays reproducible):** filters 4-5 are
**DIAGNOSTIC weights**, surfaced as
`methodology.breakdown.confidence_weighted_qualified_micro` (`Σ qualified ×
ageWeight × originMultiplier`), and **DO NOT enter the headline score**. Only the
three binary gates decide `qualified_micro`, so an external party reproduces the
headline from binary rules alone (sdd.md §4.3 option a). Curves + defaults
(`ageFullTrustDays=30`, `ageWeightFloor=0.1`, `externalOriginBonus=1.25`) are
env-tunable and written down in `config.ts` + `docs/ORACLE-METHODOLOGY.md` §5.

### Task 3.6 — Realness score + anti-self-grading + open methodology
`score = qualified_micro / raw_micro`, clamped to [0,1]; `raw=0 → 0`. Every run
emits an open `methodology` object: version, provider_mode, `as_of`, the formula
string, the OPEN-5 reconciliation string, the five filter descriptors, and a full
numeric breakdown (raw/qualified/flagged/dropped-dust/dropped-circular/
confidence-weighted + affiliated & circular payer counts). **Anti-self-grading:**
`computeAllServices` indexes all services uniformly; affiliate gate runs FIRST so
affiliated revenue is always attributed to `flagged_affiliated_micro` and excluded
from the headline — the oracle reports ~$0 qualified for an affiliated-only service.

### Task 3.7 — MockChainProvider (deterministic, keyless)
`src/adapters/chain/mock-chain-provider.ts` implements `IChainProvider` over a
fixed `SyntheticGraph` (`src/oracle/synthetic-graph.ts`). NO clocks, NO randomness,
NO network — every timestamp is `epoch + dayOffset`; transfers are sorted
deterministically at construction; `getActivity` returns activities in fixed
(time, from, to) order. Its `getActivity` signature matches the port's optional
declaration exactly (verified by typecheck). Synthetic addresses are obviously-fake
labeled hex (`0xfa46…` farm, `0xc1ea…` clean, `0xaff1…` affiliate) — nothing made
to look real.

---

## LIVE DB verification (the Sprint-3 mandate — NOT deferred)

Spun a throwaway **Postgres 16** (`docker run --rm -d --name arc-pg-s3 …
postgres:16 -p 5436`), waited for `pg_isready`, applied **0001→0005** via
`docker exec … psql -v ON_ERROR_STOP=1` (psql inside the container; no host psql).
All five applied **green**; `\d x402_settlements` showed all 10 columns,
`UNIQUE(chain_id, tx_hash)`, both indexes, both append-only triggers, both `>= 0`
CHECKs. Then ran `npx tsx src/oracle/verify-live.ts` against `DATABASE_URL` pointing
at the live DB.

**Per-service headline (live, real Postgres rows, MockChainProvider for the graph):**

| service | raw | flagged_affiliated | qualified | score |
|---|---|---|---|---|
| `svc-honeyjar` | $100.00 | **$80.00** | $20.00 | **0.2000** |
| `svc-thirdparty` | $200.000005 | $0.00 | $100.00 | **≈0.5000** |

- **Anti-self-grading PROVEN:** `svc-honeyjar` is paid by an affiliated payer
  ($80, injected into the allowlist) + one clean payer ($20). The affiliated $80 is
  FLAGGED and EXCLUDED → qualified $20, score 0.20. The oracle does not flatter the
  affiliated service. (`verify-live.ts` prints "affiliated revenue is FLAGGED and
  EXCLUDED from the headline (PASS).")
- **Farm-reduces / clean-survives PROVEN:** `svc-thirdparty` raw $200.000005;
  circular-flow farm ($100) dropped by Filter 3, dust ($0.000005) dropped by
  Filter 2; both clean aged externally-funded payers ($40 + $60) survive →
  qualified $100, score ≈0.50. Clean-only would be 1.0 → the farm demonstrably
  lowers the score.
- **Determinism (Assertion D precursor):** in-process rerun byte-identical (YES);
  additionally two SEPARATE `tsx` process invocations produced **identical sha256**
  (`4fcaf442…`), 152/152 lines.
- **DB guards observed live:** a duplicate `(80069, tx_hash)` insert was rejected
  (`x402_settlements_chain_tx_uq`); an `UPDATE` was rejected by `prevent_mutation()`
  (`append-only: UPDATE not permitted`); row count stayed at 6.

Container torn down (`docker rm -f arc-pg-s3`). No persistent DB left.

### Static verification

- **Sprint-3 oracle subset typechecks CLEAN** (`tsc --noEmit` scoped to
  `src/oracle/**` + mock + port → exit 0). The whole-project `tsc` errors are
  entirely in the copied Sprint-1 chain adapters (`dune-sim-client.ts`,
  `hybrid-provider.ts`, `provider-factory.ts`, `x402.routes.ts`) — the deferred P2
  bug `loa-arcturus-hkj` (missing `dune-sim-types`/`native-reader`/`config`
  siblings). The oracle path imports NONE of those (verified by grep).
- **Oracle unit tests: 10/10 pass** (`vitest run src/oracle/oracle.test.ts`).
  Project-wide `vitest` reports 348 passing / 0 test failures; the 94 "failed
  files" are `.loa/` submodule non-suites swept up because the repo ships no vitest
  config to scope the glob (test-runner scoping gap, not a code failure).

---

## AC Verification (sprint.md:147-153)

| AC | Status | Evidence |
|----|--------|----------|
| Per-service output with `score ∈ [0,1]`; Raw, Qualified, score side by side | ✓ Met | `ServiceRevenue` (`types.ts`); live headline table; score clamp `oracle.ts:222` |
| Filters 1–3 implemented; cycle-detection + funding-graph on `getActivity` (net-new) | ✓ Met | `oracle.ts classify()`; `funding-graph.ts findCycleCounterparties()`; `net_new:true` |
| Filters 4–5 implemented; OPEN-5 weighting-vs-binary documented; headline reproducible | ✓ Met | `funding-graph.ts` profiling; `config.ts` OPEN-5 block; `docs/ORACLE-METHODOLOGY.md` §5 |
| Anti-self-grading: a 0xhoneyjar affiliated payer flagged + excluded from headline | ✓ Met | live `svc-honeyjar` $80 flagged → qualified $20, score 0.20; `oracle.test.ts` 2 tests |
| Methodology open & reproducible (emitted in `methodology` field / docs) | ✓ Met | `Methodology` emitted every run; `docs/ORACLE-METHODOLOGY.md` §7 reproduce steps |
| `MockChainProvider` deterministic for the same synthetic graph | ✓ Met | byte-identical rerun + identical sha256 across 2 processes |

All Sprint-3 success metrics (sprint.md:180) demonstrated: farm-like wallets reduce
the score, clean wallets survive, mock output deterministic.

---

## Guardrail compliance

- **Read-only / fee-free / PoL-free:** oracle never writes chain state, never gates
  emissions; no fee/treasury/PoL code. Settlements repo is read-only. Role 1 OUT.
- **`../loa-freeside` and siblings untouched:** read-only; zero writes to any
  sibling repo.
- **No git ops:** no stage/commit/push/PR/branch/stash/checkout. All new files
  untracked. `br` beads writes only. Human stages.
- **Provenance honesty:** OPEN-3 placeholders (no invented addresses); OPEN-4
  documented tunable; OPEN-5 reconciliation written down; Filter 3 marked NET-NEW
  (not claimed inherited). Synthetic addresses obviously fake.
- **Sprint 3 ONLY:** no docker-compose, no seed/verify acceptance harness, no CI, no
  README quickstart, no PROOF-SCHEMA.md (all Sprint 4). `verify-live.ts` is a
  Sprint-3-scoped live driver, explicitly NOT the Sprint-4 acceptance harness.
