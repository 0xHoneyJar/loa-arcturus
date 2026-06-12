# loa-arcturus — Proof-of-Revenue Oracle (Role 3 PoC)

> **This is a mechanism demo, not an economy claim.** This proof-of-concept
> proves that an open, anti-sybil **meter** can separate real arms-length agent
> revenue from farm/wash loops on the Berachain x402 rail. It makes **no claim**
> that a real Berachain agent economy exists yet, and **no claim** about any
> dollar figure of real agent revenue. The data you run it against here is
> **seeded synthetic / self-broadcast test data on Bepolia testnet** — it
> demonstrates *that the meter works*, never *that the economy is real*.
> Conflating the two would rebuild the exact "agentic GDP" dishonesty this oracle
> exists to expose. Read this paragraph as the binding framing for everything
> below.

A read-only, fee-free, open-source (AGPL-3.0) revenue-truth oracle for the
Berachain agent economy. It ingests x402 payment settlements, profiles payer
wallets, applies an anti-farming filter stack, and publishes **Qualified
Revenue** (real arms-length demand) vs **Raw Revenue** (everything) per service,
with a per-service **realness score ∈ [0,1]** and fully open methodology.

The point of this repo is **external reproducibility**: an external reviewer
(or anyone) can boot it on a clean machine, with **zero 0xhoneyjar
secrets**, and confirm the meter is real **without trusting us**.

---

## 5-minute quickstart

**Prerequisites:** Docker + Docker Compose. Nothing else — no keys, no accounts.

```bash
cp .env.example .env      # optional — the defaults work as-is for the keyless run
docker compose up         # Postgres + Redis + auto-migrate (0001-0005) + seed + verify
```

That one command:

1. boots Postgres + Redis (non-conflicting ports `5544` / `6399`),
2. **auto-runs migrations `0001`–`0005`** (including the payer-persistence table),
3. **seeds** a deterministic synthetic scenario through the **real `settle()`
   path** (not direct DB inserts), and
4. **verifies** it — printing the per-service Raw/Qualified/score table and the
   four acceptance assertions, then **exits `0`** when the keyless assertions
   pass.

Tear down the throwaway acceptance DB with:

```bash
docker compose down -v
```

### What you'll see

```
Per-service Raw / Qualified / flagged-affiliated / realness score:
  service                      raw       qualified     flagged_aff  score
  svc-honeyjar         $100.000000      $20.000000      $80.000000  0.2000
  svc-thirdparty       $200.000005     $100.000000       $0.000000  0.5000

Assertions:
  [A] ✓ PASS  farm-like wallets excluded from Qualified
  [B] ✓ PASS  clean / external-funded wallets survive into Qualified
  [C] ◐ TESTER-REQUIRED  every counted tx_hash resolves on the Bepolia explorer
  [D] ✓ PASS  re-running verify is deterministic (same inputs → same scores)

VERDICT: PASS (keyless legs) — A/B/D evaluated; C TESTER-REQUIRED (need a live chain/Dune key). Exit 0.
```

- **`svc-honeyjar` scores `0.20`, not `1.0`** — its $80 of affiliated revenue is
  **flagged and excluded** from the headline. The oracle does **not** flatter the
  team that built it. That honesty is the product (**anti-self-grading**).
- **`svc-thirdparty` scores `0.50`** — its two clean payers ($40 + $60) survive
  into Qualified; the circular-flow farm ($100) and the sub-cent dust farm
  ($0.000005) are dropped.

---

## The two modes — `mock` proves filter logic, `dune` proves real data

The anti-sybil filters need transaction-graph data (`getActivity`), which is
**Dune-Sim-exclusive**. So a tester is **never blocked** by a missing key:

| `CHAIN_PROVIDER` | Keys needed | What it proves |
|------------------|-------------|----------------|
| **`mock`** (default) | **none** | The **filter logic** (the meter). Runs the full §5 filter stack against a deterministic synthetic funding graph. This is what CI and `docker compose up` run. |
| **`rpc`** | `BEPOLIA_RPC_URL` + a faucet-funded throwaway `SEED_PRIVATE_KEY` | **Live self-broadcast.** Broadcasts real Bepolia txs from your own key (on-chain `from` == real payer), confirms each on-chain, writes via `settle()`. Makes **Assertion C** evaluable live. |
| **`dune`** | `DUNE_SIM_API_KEY` | **Real on-chain data.** Profiles real payer wallets via Dune Sim — the farm-vs-clean scoring (Assertions A/B) on real addresses. |

> **mock = filter logic; dune = real data.** The mock provider fabricates **no**
> claim about real Bepolia revenue — it feeds the filter logic a *known* graph so
> the meter's farm-vs-clean classification can be proven, keyless and
> deterministic.

### The acceptance assertions (`pnpm verify`)

| ID | Assertion | Keyless (mock)? |
|----|-----------|-----------------|
| **A** | Farm-like wallets' revenue is **excluded** from Qualified (score drops as designed). | ✅ evaluated |
| **B** | Clean / external-funded wallets **survive** into Qualified. | ✅ evaluated |
| **C** | Every **counted** `tx_hash` **resolves on the public Bepolia explorer** ([bepolia.beratrail.io](https://bepolia.beratrail.io)). | ◐ **tester-required** |
| **D** | Re-running `verify` is **deterministic** (same inputs → same scores). | ✅ evaluated |

**`pnpm verify` exits `0` iff all *evaluable* assertions pass.** In keyless mock
mode, **A, B, D are evaluated and must pass**; **C is reported `TESTER-REQUIRED`**
— the counted hashes are synthetic `mock:` labels that do **not** resolve on the
explorer, and the harness **never fakes** explorer resolution to turn C green. To
evaluate C live, run with `CHAIN_PROVIDER=rpc` and a faucet-funded key (below).

---

## Running the live legs (optional — tester supplies their own inputs)

A tester supplies **at most three** values, and **only** for the optional live
legs (none are 0xhoneyjar secrets):

1. `BEPOLIA_RPC_URL` — a public Bepolia RPC, e.g. `https://bepolia.rpc.berachain.com`
2. `SEED_PRIVATE_KEY` — a **throwaway** key you funded from the
   [Bepolia faucet](https://bepolia.faucet.berachain.com). **Never use a key with
   real value.**
3. `DUNE_SIM_API_KEY` — *(optional)* for real on-chain payer profiling.

```bash
# Live self-broadcast on Bepolia (makes Assertion C evaluable):
CHAIN_PROVIDER=rpc BEPOLIA_RPC_URL=https://bepolia.rpc.berachain.com \
  SEED_PRIVATE_KEY=0xyour_throwaway_key \
  pnpm seed:bepolia        # broadcasts real txs, prints every tx_hash
CHAIN_PROVIDER=rpc BEPOLIA_RPC_URL=https://bepolia.rpc.berachain.com \
  pnpm verify              # resolves each counted tx_hash on-chain (Assertion C)
```

Every `tx_hash` the seed prints is independently verifiable — open it on
[bepolia.beratrail.io](https://bepolia.beratrail.io). The live `viem` dependency
is loaded only on this path; the keyless mock path needs no web3 dependency.

### Running on the host (without Docker)

```bash
pnpm install
# point at a Postgres with migrations 0001-0005 applied:
export DATABASE_URL=postgres://arcturus:arcturus@localhost:5544/arcturus
bash migrations/run-migrations.sh   # if not already applied
pnpm seed:bepolia                   # CHAIN_PROVIDER defaults to mock
pnpm verify
```

---

## What the tester confirms (and what they do NOT)

- **They confirm:** the meter works — settlements in, correct Raw/Qualified/
  realness out, farm wallets demonstrably filtered, results reproducible, and (in
  live mode) tx_hashes independently verifiable on the explorer.
- **They are NOT asked to confirm** any claim about real Berachain agent revenue.
  There is none yet — that's the mechanism-vs-economy line in the first paragraph.

---

## CI

`.github/workflows/acceptance.yml` runs this same harness in **mock mode with no
secrets** on every push/PR — so the badge is green before you even clone.

---

## How it works (the short version)

```
self-broadcast tx ─▶ settle() ─▶ x402_settlements (payer_address persisted) ─▶ oracle ─▶ verify
   (real `from`)      (real path)   (migration 0005, append-only)         (§5 filters)  (A–D)
```

The oracle applies five filters per settlement: **(1)** affiliate exclusion
(flag-not-count, anti-self-grading), **(2)** dust floor (anti-spam wash), **(3)**
circular-flow cycle detection (funded-by / routes-back-to the recipient) — these
three are **binary gates** that decide the headline; **(4)** wallet-age weighting
and **(5)** external-origin bonus are **diagnostics** that do *not* enter the
reproducible headline score. Full rationale: [`docs/ORACLE-METHODOLOGY.md`](docs/ORACLE-METHODOLOGY.md).

## Documentation

| Doc | What it covers |
|-----|----------------|
| [`docs/ORACLE-METHODOLOGY.md`](docs/ORACLE-METHODOLOGY.md) | The filter stack, the realness score, anti-self-grading, OPEN-3/4/5 decisions. |
| [`docs/PROOF-SCHEMA.md`](docs/PROOF-SCHEMA.md) | **The seam handed to the rail owner:** the proof object `{tx_hash, chain_id, from, amount, nonce}`, the **mandatory client-signed-payer (relayer-masking) constraint**, and the deferred/out-of-scope fee statement. |
| [`docs/SETTLEMENT-MODEL.md`](docs/SETTLEMENT-MODEL.md) | The self-broadcast settlement model + the UNVERIFIED HONEY token note. |
| `ROLE3-ORACLE-SPEC.md` | The authoritative technical spec. |

## Scope & posture

- **Read-only, fee-free, PoL-free.** The oracle contains **no** on-chain fee,
  treasury, or Proof-of-Liquidity logic in any phase. The protocol fee is
  deferred to the rail owner's later on-chain layer (see `docs/PROOF-SCHEMA.md`
  §4). Role-1 / PoL emission gating is **out of scope**.
- **Provenance honesty is the product.** This is an anti-fraud tool; nothing is
  invented to look real. The affiliate allowlist ships clearly-labeled,
  unmatchable placeholders (not invented addresses); the HONEY token standard is
  carried as **UNVERIFIED** rather than guessed (`docs/SETTLEMENT-MODEL.md` §2).
- **License:** AGPL-3.0-or-later. Derived from `loa-freeside` (AGPL-3.0); see
  `NOTICE`, `PROVENANCE.md`, and per-file provenance headers.
