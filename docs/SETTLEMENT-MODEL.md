# Settlement Model — Self-Broadcast (Sprint 2, FR-4)

**Status:** PoC settlement model for loa-arcturus (Role 3 — Proof-of-Revenue Oracle).
**Authoritative spec:** `ROLE3-ORACLE-SPEC.md` §4, §10.1, §11.
**Date:** 2026-06-10 (Sprint 2 — "The Gap + Bepolia Config").

> Scope: this document records the settlement model the PoC uses and **the one
> token fact that remains UNVERIFIED**. It does not introduce any on-chain fee,
> treasury, or PoL logic — the oracle is read-only and fee-free in all phases
> (`ROLE3-ORACLE-SPEC.md:11-16, 46-51`).

---

## 1. The model: direct self-broadcast (NO managed facilitator, NO relayer)

For the PoC, the payer wallet **broadcasts its own token transfer** on Bepolia
(80069) and hands the server the resulting `tx_hash`. The server then **READS
the chain** to confirm the transfer before counting it. There is **no managed
facilitator, no thirdweb, no server-side relayer** in the settlement path
(`ROLE3-ORACLE-SPEC.md:128-132, 235-237`).

```
payer wallet ──self-broadcast transfer──▶ Bepolia (80069)
     │                                          ▲
     │ hands server the tx_hash                 │ server READS to confirm
     ▼                                          │
  x402.routes  ──proof { tx_hash, chain_id, from, amount, nonce }──▶ settle()
                                                                       │
                                            persists payer_address ────┘
                                            into x402_settlements (migration 0005)
```

### Why self-broadcast is the deliberate choice (the trust anchor)

The on-chain `from` is the **anti-sybil trust anchor**. The Sprint 3 oracle
profiles the payer wallet (funding history, wallet age, circular-flow, external
origin) to separate real arms-length demand from farm loops. That profiling is
**only meaningful if `from` is the real payer.**

- **Self-broadcast → `from` == real payer.** The anti-sybil layer works.
- **Managed relayer → `from` == the relayer.** Every settlement would profile
  the *same* relayer wallet, and payer-profiling becomes worthless. This is the
  **relayer/payer-masking risk** — "the single most important constraint to hand
  the rail owner" (`ROLE3-ORACLE-SPEC.md:306-311`). It is carried into the
  Sprint 4 `docs/PROOF-SCHEMA.md` seam: the rail owner's future canonical x402
  rail MUST expose the real client-signed payer address in the proof.

### What Sprint 2 persisted to make this real (THE GAP, FR-3)

Migration `0005_x402_settlements.sql` + the `settle()` change persist
`payer_address = proof.from` for **every** settlement, alongside the existing
`usage_events` (Raw Revenue) write. `UNIQUE(chain_id, tx_hash)` rejects
double-counting a tx; append-only triggers keep the settlements ledger immutable.
This replaces the prior behavior where the payer was parsed but discarded
(`webhook_events.payload = '{}'`). See `migrations/PROVENANCE.md` and the
Sprint-1→Sprint-2 NOTES.md Decision Log.

---

## 2. [UNVERIFIED] HONEY token standard / Bepolia HONEY contract address

**This is an explicit confirm-against-source task. It MUST NOT be resolved by
guessing** (`ROLE3-ORACLE-SPEC.md:133-136, 292-297`). This is an anti-fraud
project; the meter's credibility is the product, so an unconfirmed token fact is
recorded as UNVERIFIED rather than invented.

### What is NOT known (and must be confirmed against a real source)

| Item | Status | Source needed |
|------|--------|---------------|
| HONEY's exact token standard on Bepolia (e.g. whether it supports EIP-3009 transfer-with-authorization, EIP-2612 permit, or only plain ERC-20 `transfer`) | **UNVERIFIED** | HONEY's Bepolia contract (read its ABI) + Berachain x402 docs |
| HONEY's Bepolia contract address | **UNVERIFIED** | Berachain docs / faucet / official token list |

### What the source actually says (the only sourced statement)

The Berachain x402 tutorial states only that *"Honey and USDC have the
functionality required for x402"* via an off-chain signed authorization + a
server-wallet relay. It does **NOT** name a specific EIP. An earlier draft's
claim that "HONEY supports EIP-3009 / EIP-2612" is **NOT sourced** — a repo grep
finds zero references (`ROLE3-ORACLE-SPEC.md:292-296`).

### Why the PoC is NOT blocked by this

The self-broadcast model (§1) uses **normal transfers** — the payer sends a
standard transfer and hands over the `tx_hash`. It does **not** depend on any
transfer-with-authorization / permit flow, so the PoC does not need to know
HONEY's authorization interface to function (`ROLE3-ORACLE-SPEC.md:296-297`).

The facilitator descriptor advertised by `x402.routes.ts` carries the token as a
**display symbol string only** (`settlementToken`, default `'HONEY'`, `'USDC'`
also accepted) — it is **not** a contract address and implies **no** token
interface. No HONEY ABI, address, or standard is encoded anywhere in this PoC.

### Confirm-against-source task (carried forward)

> **CONFIRM-AGAINST-SOURCE (OPEN-2):** Before any future code relies on a HONEY
> transfer-with-authorization flow (e.g. a managed-facilitator settlement path —
> explicitly *not* this PoC), confirm HONEY's Bepolia contract address and its
> supported methods by reading the actual contract + Berachain docs. Until then,
> the HONEY token standard remains **UNVERIFIED** and only the self-broadcast
> (plain-transfer) model is supported. Tracked as beads `loa-arcturus-yuv`
> (Task 2.5) and SDD OPEN-2.

---

## 3. Bepolia chain parameters — CONFIRMED (OPEN-6 resolved)

Added to `CHAIN_CONFIGS` (`src/core/ports/chain-provider.ts`) as `bepolia`.
Params **confirmed against the canonical ethereum-lists EVM chain registry**
(`https://chainid.network/chains.json`, entry `chainId: 80069`) — not guessed:

| Param | Value | Source |
|-------|-------|--------|
| chainId | `80069` | ethereum-lists registry (matches spec §4) |
| name | `Berachain Bepolia` | ethereum-lists registry |
| native symbol | `BERA` | ethereum-lists `nativeCurrency.symbol` |
| decimals | `18` | ethereum-lists `nativeCurrency.decimals` |
| RPC | `https://bepolia.rpc.berachain.com` | ethereum-lists `rpc[0]` (canonical Berachain RPC) |
| explorer | `https://bepolia.beratrail.io` | ethereum-lists `explorers[0]` (matches spec §4) |
| isTestnet | `true` | testnet |

Berachain mainnet (`80094`) is retained unchanged.

> Note: the **native** symbol/decimals above describe BERA (the gas token).
> They are distinct from the **HONEY** token used for x402 settlement value,
> whose contract/standard remains UNVERIFIED per §2.
