# =============================================================================
# loa-arcturus — oracle service image (Sprint 4, Task 4.1)
# =============================================================================
# Builds the keyless acceptance runtime: Node 22 + pnpm + the harness scripts.
# Used by docker-compose's `oracle` service to seed (real settle() path) and
# verify (Assertions A-D) in mock mode with zero external keys.
#
# No build step / no bundler: the PoC runs TypeScript directly via tsx, matching
# the `pnpm seed:bepolia` / `pnpm verify` commands a tester runs on the host.
# =============================================================================
FROM node:22-slim

# pnpm via corepack (pinned by package.json "packageManager").
RUN corepack enable

WORKDIR /app

# Install dependencies first (layer-cached). --frozen-lockfile proves the
# pinned lockfile is sufficient — no network-driven resolution at build time.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# App sources + migrations + harness scripts.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

# Default: keyless mock. docker-compose overrides command to seed && verify.
ENV CHAIN_PROVIDER=mock
CMD ["pnpm", "verify"]
