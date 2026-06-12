# Dependency Pinning — provenance

Every version in `package.json` is pinned against a **real loa-freeside
manifest** at commit `f0354ff14dff81ea1ed5189f6af00a0afcf068c3`. No version was
invented. This file records the source manifest for each pin and the one
conflict that required a documented decision.

## Runtime dependencies (only 4 — these are everything the copied files import)

The curated copy imports exactly four external packages (verified by grepping
`import` statements across `src/`): `express`, `ioredis`, `pg`, `pino`.

| package | pinned | source manifest | notes |
|---------|--------|-----------------|-------|
| `pg` | `^8.16.3` | `themes/sietch/package.json` | the deployable app that runs the services/routes |
| `ioredis` | `^5.9.1` | `themes/sietch/package.json` | sietch declares `^5.9.1`; `packages/adapters` declares `^5.9.2` — chose the app-level (sietch) pin since it governs the runtime that executes `settle()`. `^5.9.1` satisfies `^5.9.2`'s caller too. |
| `pino` | `^9.5.0` | `themes/sietch/package.json` | sietch `^9.5.0`; adapters dev-dep `^9.0.0`. Chose the higher app pin. |
| `express` | `^4.21.1` | `themes/sietch/package.json` | **CONFLICT — see below.** |

### express version conflict (documented, not guessed)

- `themes/sietch/package.json` → `express: ^4.21.1`
- root `package.json` (devDependencies) → `express: ^5.2.1`

`x402.routes.ts` imports only `{ Router, Request, Response }` — API stable
across Express 4↔5. **Decision: pin `^4.21.1`** (the sietch app manifest), because
`themes/sietch` is the deployable that actually mounts these routes and services;
the root `^5.2.1` governs the repo-root supertest harness, not the route runtime.
This is a reversible choice — if Sprint 4's harness targets Express 5, bump then.
The point of record: the conflict is real, surfaced, and resolved against the
manifest that owns the runtime — not invented.

## Dev dependencies

| package | pinned | source manifest |
|---------|--------|-----------------|
| `typescript` | `^5.3.0` | `packages/core/package.json`, `packages/adapters/package.json` |
| `vitest` | `^1.0.0` | `packages/core/package.json`, `packages/adapters/package.json` |
| `tsx` | `^4.19.2` | `apps/worker/package.json` (lowest of the observed `^4.19.2` / `^4.20.0` / `^4.7.0`) |
| `@types/node` | `^22.19.5` | observed across manifests (engines: `node >=22`) |
| `@types/pg` | `^8.16.0` | observed in a workspace manifest declaring `@types/pg` |
| `@types/express` | `^5.0.6` | `packages/adapters/package.json`, root `package.json` |

## Project metadata pins

| field | value | source |
|-------|-------|--------|
| `packageManager` | `pnpm@9.15.4` | `loa-freeside/package.json` (verbatim) |
| `engines.node` | `>=22` | `loa-freeside/package.json` (verbatim) |
| `type` | `module` | copied files use ESM `.js` import specifiers |

## Known gaps (deferred, NOT silently resolved)

- **Chain-adapter full compile-closure is NOT yet satisfied.** The copied chain
  adapters (`dune-sim-client.ts`, `hybrid-provider.ts`, `provider-factory.ts`)
  import sibling modules NOT named in spec §2 — `./dune-sim-types.js` (needs
  `zod`), `./native-reader.js` (needs `viem` + `opossum`), `./config.js`,
  `./dune-sim-metrics.js`, `./metrics.js`. These siblings are NOT copied in
  Sprint 1 because they are NOT on the `settle()` path (the Sprint 1 acceptance
  gate). They feed the **Oracle (Sprint 3)**. When Sprint 3 copies them, add
  `zod ^3.23.0`, `viem ^2.21.0`, `opossum ^9.0.0` (sources:
  `packages/adapters/package.json`, `themes/sietch/package.json`). Logged as a
  discovered issue against Task 1.2. The §2-named adapter files themselves are
  present with headers intact, per the Sprint 1 acceptance criterion.
- A lockfile (`pnpm-lock.yaml`) is intentionally NOT generated this run — no
  `pnpm install` was executed (no network/install side effects taken).
