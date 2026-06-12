# PROVENANCE — loa-arcturus

loa-arcturus is a **derivative work**. Its off-chain measurement primitives are
a **curated copy** (not a full fork) of source files from `loa-freeside`. The
derivation is AGPL-3.0 → AGPL-3.0; direct reuse is permitted under the upstream
license. This file is the authoritative per-file derivation record. Every
copied source file additionally carries an in-file `PROVENANCE` header block
(AGPL §5(a) change notice).

## Upstream snapshot

| Field | Value |
|-------|-------|
| Upstream project | loa-freeside ("Freeside", L4 substrate of the Loa protocol) |
| Upstream owner | 0xHoneyJar |
| Upstream license | AGPL-3.0 |
| Source working tree | `../loa-freeside` (read-only sibling) |
| Source commit | `f0354ff14dff81ea1ed5189f6af00a0afcf068c3` |
| Commit date | 2026-06-08 |
| Copied on | 2026-06-10 (loa-arcturus Sprint 1) |

## Copied TypeScript files (verbatim — unmodified bodies)

Each file below was copied **byte-for-byte** (body md5 verified equal to
upstream); only an in-file provenance header block was prepended. The original
loa-freeside JSDoc header and body are unchanged.

| loa-arcturus path | upstream path | in spec §2? |
|-------------------|---------------|-------------|
| `src/services/x402-settlement.ts` | `packages/services/x402-settlement.ts` | ✅ yes |
| `src/routes/x402.routes.ts` | `packages/routes/x402.routes.ts` | ✅ yes |
| `src/services/credit-lot-service.ts` | `packages/services/credit-lot-service.ts` | ✅ yes |
| `src/adapters/storage/lot-entry-repository.ts` | `packages/adapters/storage/lot-entry-repository.ts` | ✅ yes |
| `src/adapters/chain/dune-sim-client.ts` | `packages/adapters/chain/dune-sim-client.ts` | ✅ yes (chain adapter) |
| `src/adapters/chain/hybrid-provider.ts` | `packages/adapters/chain/hybrid-provider.ts` | ✅ yes (chain adapter) |
| `src/adapters/chain/provider-factory.ts` | `packages/adapters/chain/provider-factory.ts` | ✅ yes (chain adapter) |
| `src/core/ports/chain-provider.ts` | `packages/core/ports/chain-provider.ts` | ✅ yes (IChainProvider) |
| `src/services/community-scope.ts` | `packages/services/community-scope.ts` | ⚠️ **NO — transitive** |
| `src/services/purpose-service.ts` | `packages/services/purpose-service.ts` | ⚠️ **NO — transitive** |
| `src/services/feature-flags.ts` | `packages/services/feature-flags.ts` | ⚠️ **NO — transitive** |

### Transitive dependencies NOT in the spec §2 list (net-new finding)

The spec §2 curated-copy list (`ROLE3-ORACLE-SPEC.md:60-68`) is **incomplete for
a file set that actually compiles/imports**. The three `⚠️` files above are hard
import dependencies of the §2 files and were verified necessary by reading the
source `import` statements at commit `f0354ff`:

- **`community-scope.ts`** — `x402-settlement.ts:21` does
  `import { withCommunityScope } from './community-scope.js'`. It is the
  `BEGIN/SET LOCAL/COMMIT` transaction wrapper `settle()` runs inside. Hard
  runtime dependency.
- **`purpose-service.ts`** — `credit-lot-service.ts:20` does
  `import type { EconomicPurpose } from './purpose-service.js'` (type-only). Its
  own runtime import `feature-flags.ts` is pulled transitively.
- **`feature-flags.ts`** — imported by `purpose-service.ts:17`
  (`import { isFeatureEnabled } from './feature-flags.js'`). Pulled in to keep
  `purpose-service.ts` self-consistent.

These three were copied **verbatim** with the same provenance discipline and are
flagged here rather than silently included. They contain no "leave-behind"
dependencies (no Discord / NOWPayments / sietch / constructs / agent-gateway /
ensemble imports — verified).

## Migrations

See [`migrations/PROVENANCE.md`](migrations/PROVENANCE.md) for the migration
derivation + the **OPEN-1** dependency-chain resolution (strip-down vs port
decision), documented with provenance.

## License files

| loa-arcturus file | source | change from upstream |
|-------------------|--------|----------------------|
| `LICENSE` | `../loa-freeside/LICENSE.md` (canonical AGPL-3.0, 662 lines) | removed the single freeside-specific commercial dual-license sentence (upstream L11); pure AGPL-3.0 remains |
| `NOTICE` | net-new | attribution + derivation record |
| `CONTRIBUTING.md` | net-new (DCO pattern consistent with upstream) | DCO sign-off required; CLA noted later/optional |

## What was deliberately NOT copied ("leave behind")

Per `ROLE3-ORACLE-SPEC.md:69-70`: agent gateway, ensemble accounting,
Discord/themes/sietch, NOWPayments payout machinery, constructs, and the large
`.loa.config.yaml`. See Sprint 1 Task 1.5 verification (`migrations/PROVENANCE.md`
and the implementation report) for the explicit absence check.
