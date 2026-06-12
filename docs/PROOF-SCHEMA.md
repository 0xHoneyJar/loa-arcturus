# Proof Schema — The Seam Handed to the external on-chain rail owner

**Status:** Interface contract (Role 3 PoC → rail owner settlement rail).
**Authoritative spec:** `ROLE3-ORACLE-SPEC.md` §1, §7, §10, §11; `grimoires/loa/sdd.md` §6.
**Date:** 2026-06-11 (Sprint 4 — "Acceptance Harness, Proof-Schema Seam & E2E").

> **What this document is.** The Proof-of-Revenue Oracle is an **off-chain,
> read-only measurement layer**. It does not settle payments; it *consumes* the
> settlement proofs an x402 rail *produces* and publishes Raw vs Qualified
> Revenue per service. This file specifies the **proof object at the seam** — the
> stable interface the rail owner's future canonical Berachain x402 settlement
> rail must emit so the oracle can keep measuring once it points at mainnet.
>
> It carries **one load-bearing constraint** (§3) that the entire anti-sybil
> thesis depends on, and **one explicit non-goal** (§4): the protocol fee, which
> is deferred to the rail owner's on-chain layer and is **out of scope for this
> PoC**.

---

## 1. The layer split (who produces, who consumes)

| Layer | Owner | Enforcement | Responsibility for the proof |
|---|---|---|---|
| On-chain x402 settlement rail | **external on-chain rail owner** (later) | on-chain (canonical contract) | **PRODUCES** the proof; **MUST** populate `from` with the real client-signed payer (§3) |
| Off-chain measurement (this repo) | 0xhoneyjar | open code (AGPL-3.0) | **CONSUMES** the proof; persists `from` as the anti-sybil anchor; profiles + scores |

The proof is the **only** coupling between the two layers. Everything the oracle
needs to do its job arrives in this object; everything about *how* the payment
settled on-chain stays on the rail owner's side of the seam.

---

## 2. The proof object

**`Proof = { tx_hash, chain_id, from, amount, nonce }`**

This is exactly the shape the PoC consumes today via `settle()`
(`src/services/x402-settlement.ts`, `X402PaymentProof`) and persists into
`x402_settlements` (migration `0005_x402_settlements.sql`). The rail owner's
canonical rail should emit the same five fields.

| Field | Type (wire) | Persisted as | Meaning & contract |
|-------|-------------|--------------|--------------------|
| `tx_hash` | `0x`-prefixed 32-byte hex string (66 chars) | `x402_settlements.tx_hash` (`TEXT`) | The on-chain transaction hash of the settlement. **MUST resolve on the public Bepolia/Berachain explorer** (`https://bepolia.beratrail.io`) — this is what makes a counted dollar independently verifiable (acceptance **Assertion C**). Paired with `chain_id` it is the dedup key: `UNIQUE(chain_id, tx_hash)` rejects double-counting a settlement. |
| `chain_id` | integer (EIP-155) | `x402_settlements.chain_id` (`INTEGER`) | The chain the settlement occurred on. `80069` = Berachain Bepolia (testnet, this PoC); `80094` = Berachain mainnet (the eventual target). The oracle is **config-driven** — no chain is hardcoded; it reads whatever `chain_id` the proof carries. |
| `from` | `0x`-prefixed 20-byte hex address | `x402_settlements.payer_address` (`TEXT`) | **The real, client-signed on-chain payer.** This is the **anti-sybil trust anchor** — the address the oracle profiles (wallet age, funding graph, circular-flow, external origin) to separate arms-length demand from farm loops. **See the mandatory constraint in §3.** |
| `amount` | integer micro-USD (carried as `bigint`; `amount_micro`) | `x402_settlements.actual_micro` (`NUMERIC(30,0)`) | The settled revenue, in micro-USD (`1 USD = 1,000,000 micro`). The oracle sums these into Raw Revenue and, after the §5 filters, Qualified Revenue. No floating point on the economic path. |
| `nonce` | string | `x402_settlements.nonce` (`TEXT`) | Replay-prevention nonce from the quote. Durably deduped via `webhook_events(provider='x402', event_id=nonce)`; a replayed nonce rolls back the whole settlement rather than counting revenue twice. |

### Notes on the contract

- **`tx_hash` + `chain_id` are the identity of a settlement.** The oracle counts
  each `(chain_id, tx_hash)` at most once. The rail must not emit two proofs with
  the same pair for distinct settlements.
- **`amount` is the *settled* (actual) value**, not a quote. In the PoC's
  conservative-quote-settle flow the quoted amount may exceed the actual; only
  the actual settled value is revenue.
- **`from` is the payer, never the recipient or a relayer.** This is the whole
  ballgame — §3.

---

## 3. MANDATORY constraint to the rail owner — the client-signed payer (no relayer masking)

> **The canonical Berachain x402 settlement rail MUST expose the real,
> client-signed payer address in the proof's `from` field. If settlement is
> broadcast via a managed server/relayer wallet, the on-chain `from` becomes the
> relayer — and the entire anti-sybil layer is defeated.**
>
> This is *"the single most important constraint to hand the rail owner"*
> (`ROLE3-ORACLE-SPEC.md:306-311`).

### Why this is load-bearing (not a nicety)

The oracle's job is to tell **real arms-length demand** apart from **wash/farm
loops**. It does this by profiling the payer wallet behind every settlement:
how old is it, who funded it, does value route in a circle back to the service,
did it originate from a CEX/bridge (genuine outside money) or from the service
it's paying. **All of that analysis keys off `from`.**

- **`from` == real client-signed payer** → each settlement profiles a *distinct,
  real* payer. The funding graph is meaningful; farm loops are detectable;
  Qualified Revenue means something.
- **`from` == managed relayer** (the thirdweb/managed-facilitator pattern, where
  a server wallet broadcasts on the user's behalf) → **every** settlement
  profiles the *same relayer wallet*. The funding graph collapses to a single
  node, circular-flow detection is blind, wallet-age is the relayer's age, and
  **Qualified Revenue becomes indistinguishable from Raw Revenue.** The meter
  reports a confident number that measures nothing. This is precisely the
  dishonesty the oracle exists to expose — so a rail that masks the payer doesn't
  just weaken the oracle, it inverts it.

### How the PoC avoids the trap (and why the constraint still must travel)

This PoC **self-broadcasts**: the payer wallet sends its own transfer and hands
over the `tx_hash`, so on-chain `from` is structurally the real payer — **no
managed facilitator, no thirdweb, no relayer** in the settlement path (see
`docs/SETTLEMENT-MODEL.md` §1; `ROLE3-ORACLE-SPEC.md:235-237`). The acceptance
harness enforces this end-to-end: the seed broadcasts from a real key and writes
through the real `settle()` path; **Assertion C** requires every counted
`tx_hash` to resolve on the public explorer.

But the PoC's self-broadcast model is a property of *this* harness. When the
rail owner ships the **canonical** rail and the oracle points at mainnet, the
oracle no longer controls how settlement is broadcast — the rail does. So the
constraint must be **designed into the rail's proof contract**, not assumed:

> **rail-owner deliverable:** the canonical x402 settlement contract MUST set the
> proof's `from` to the address that *cryptographically authorized the payment*
> (the client signer), even when broadcast/relayed by another party. If the
> protocol uses meta-transactions / sponsored gas / a relayer for UX, the
> **payer's signed authorization** — not the relayer's broadcasting address —
> must be what surfaces as `from`. A proof that cannot distinguish payer from
> relayer is unusable for proof-of-revenue.

### Verification hook

The PoC already files **`loa-arcturus-7bi`** (P1): *the server should READ the
chain (`eth_getTransactionByHash`) to CONFIRM a settlement's on-chain `from`
before the oracle counts it* (SDD §5.4). The live seed path does this today
(`scripts/seed-bepolia.ts`: `waitForTransactionReceipt` → `getTransaction` →
`from`). The canonical rail should make the confirmed on-chain payer the
authoritative `from`, so confirmation and proof agree by construction.

---

## 4. Fee model — DEFERRED, out of scope for this PoC

> **The oracle is fee-free and contains no treasury, fee, or PoL logic — in every
> phase. The protocol fee belongs to the rail owner's later on-chain settlement
> layer and is explicitly NOT part of this Role-3 PoC.**

| Aspect | Statement |
|--------|-----------|
| **Where the fee lives** | In the rail owner's future **on-chain** x402 settlement rail — the only layer that can route value on-chain. Not in the off-chain measurement layer. |
| **Why fee-free now** | Keeping the oracle arms-length and fee-free preserves its credibility as a **neutral referee**. A measurement layer that also skims a fee cannot credibly grade revenue honesty. |
| **Proof impact** | **None.** The fee is an on-chain settlement concern; it does **not** add fields to the proof object in §2. The oracle measures settled `amount`; how (or whether) a fee was routed on-chain is invisible to — and irrelevant to — the seam. |
| **Role-1 / PoL gating** | Wiring the realness score to Proof-of-Liquidity reward-vault emission gating is **Role 1**, sequenced strictly **after** the oracle proves it measures real-vs-farm correctly. It is **OUT OF SCOPE** here (`ROLE3-ORACLE-SPEC.md:205, 211-219`). Roles 3 → 1 are never welded in the PoC. |

---

## 5. The ask (two phases)

This is **not** "please use our rails." Per `ROLE3-ORACLE-SPEC.md` §7:

- **Now (Role-3 PoC):** nothing required from the rail owner. The oracle runs
  fee-free on Bepolia with 0xhoneyjar-generated, self-broadcast data. *Show the
  working meter first* — which is exactly what the acceptance harness
  (`README.md`, `docker compose up`, `pnpm verify`) lets a external engineer
  confirm without trusting the author.
- **Later (settlement rail):** *"deploy a canonical Berachain x402
  settlement contract that exposes the real client-signed payer in its proof
  (§3) and routes the protocol fee on-chain (§4)."*
  Only the on-chain layer can change the chain; the fee and the canonical rail belong
  in that layer. The oracle (this layer) stays open and fee-free in all
  phases.

---

## 6. Cross-references

- Proof shape in code: `src/services/x402-settlement.ts` (`X402PaymentProof`, `settle()`).
- Persistence: `migrations/0005_x402_settlements.sql` (`payer_address`, `UNIQUE(chain_id, tx_hash)`, append-only).
- Settlement model + relayer rationale: `docs/SETTLEMENT-MODEL.md` §1.
- Oracle methodology (filters, score, anti-self-grading): `docs/ORACLE-METHODOLOGY.md`.
- Acceptance harness (Assertions A–D, mock/dune/rpc modes): `README.md`, `scripts/verify.ts`.
- On-chain confirmation of `from` before counting: beads `loa-arcturus-7bi` (SDD §5.4).
