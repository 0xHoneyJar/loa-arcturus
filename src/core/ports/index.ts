/**
 * ─────────────────────────────────────────────────────────────────────────
 * PROVENANCE — curated (TRIMMED) barrel derived from loa-freeside
 *   upstream file:   packages/core/ports/index.ts
 *   upstream repo:   loa-freeside
 *   upstream commit: f0354ff14dff81ea1ed5189f6af00a0afcf068c3 (2026-06-08)
 *   created:         2026-06-10 — loa-arcturus Sprint 1
 *   classification:  CURATED TRIM (NOT verbatim) — see note below
 *
 * The upstream `packages/core/ports/index.ts` barrel re-exports ~14 port
 * interfaces, MOST of which are "leave-behind" product surface that this PoC
 * deliberately does NOT copy: agent-gateway, theme-provider, vault-client,
 * wizard-session-store, wizard-engine, synthesis-engine, shadow-ledger,
 * shadow-sync, feature-gate, parallel-mode, glimpse-mode, migration,
 * score-service, storage-provider (ROLE3-ORACLE-SPEC.md:69-70).
 *
 * Copying the upstream barrel verbatim would transitively pull in that
 * leave-behind surface, violating the "curated copy, NOT full fork" directive
 * (ROLE3-ORACLE-SPEC.md:60). This barrel is therefore TRIMMED to re-export
 * ONLY the chain-provider port — the single port the copied chain adapters
 * import via the `@freeside/core/ports` alias.
 *
 * AGPL-3.0 §5(a): this is a modified file derived from the upstream barrel;
 * the modification (trimming non-chain exports) and its date are recorded
 * here. See PROVENANCE.md.
 * ─────────────────────────────────────────────────────────────────────────
 */

// Chain Provider Interface (the only port on the Role-3 oracle's path).
export * from './chain-provider.js';
