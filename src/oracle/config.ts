/**
 * ─────────────────────────────────────────────────────────────────────────
 * NET-NEW (loa-arcturus Sprint 3, FR-5) — NOT a loa-freeside copy.
 *
 * Oracle configuration — the home of OPEN-3, OPEN-4, OPEN-5.
 *
 * This is an ANTI-FRAUD oracle. Three open questions from the plan are judgment
 * calls; they are resolved here HONESTLY and TRANSPARENTLY, not by inventing
 * facts. Every value below is config-driven (env-overridable) so a maintainer
 * tunes it without code changes, and every default is documented with its
 * reasoning so the methodology stays open and reproducible.
 *
 *   OPEN-3  affiliate allowlist  → placeholder, clearly-labeled entries only.
 *   OPEN-4  dust floor           → defensible documented default, tunable.
 *   OPEN-5  weighting vs binary  → reconciliation stated as code + docs.
 *
 * See docs/ORACLE-METHODOLOGY.md for the long-form rationale.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Normalize an EVM address for set membership (lowercase, trimmed). */
export function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

// ===========================================================================
// OPEN-3 — Affiliate allowlist (Filter 1: flag-not-count)
// ===========================================================================
//
// The mechanism (flag affiliated revenue, exclude it from the headline) MUST
// work regardless of which addresses populate the list. We therefore ship
// CLEARLY-LABELED PLACEHOLDERS the maintainer replaces with the real
// 0xhoneyjar / operator / team wallets. We do NOT invent real-looking
// addresses — inventing addresses in an anti-fraud tool would itself be the
// fraud it exists to detect.
//
// Placeholders use a non-address sentinel pattern (`0x0000…0xhj01`) that can
// never collide with a real on-chain `from`, so until they are replaced they
// match nothing — Filter 1 is a no-op rather than silently mis-flagging a real
// payer. Replace them, or override at runtime via AFFILIATE_ALLOWLIST (a
// comma-separated list of addresses) / AFFILIATE_ALLOWLIST_FILE (path to a file
// with one address per line, `#` comments allowed).
//
// PROVENANCE: any address that ends up here MUST come from a cited source
// (0xhoneyjar treasury registry / deploy records). The placeholders below are
// explicitly NOT sourced and are marked as such.

/** Clearly-labeled, intentionally-unmatchable placeholder allowlist entries. */
export const PLACEHOLDER_AFFILIATE_ALLOWLIST: ReadonlyArray<{
  address: string;
  label: string;
}> = [
  // ⇩ REPLACE with the real, cited 0xhoneyjar treasury address. Until then this
  //   sentinel matches no real `from`, so no real payer is mis-flagged.
  { address: '0x0000000000000000000000000000000000000000', label: 'PLACEHOLDER_HONEYJAR_TREASURY (replace with cited address)' },
  // ⇩ REPLACE with the real, cited service-operator / deployer wallet.
  { address: '0x000000000000000000000000000000000000dead', label: 'PLACEHOLDER_OPERATOR_WALLET (replace with cited address)' },
];

/**
 * Resolve the affiliate allowlist from (in priority order):
 *   1. AFFILIATE_ALLOWLIST           — comma-separated addresses
 *   2. AFFILIATE_ALLOWLIST_FILE      — file path, one address per line
 *   3. PLACEHOLDER_AFFILIATE_ALLOWLIST (built-in placeholders)
 *
 * Returns a Set of normalized addresses. Pure w.r.t. the provided env/reader so
 * it is deterministic and unit-testable.
 */
export function resolveAffiliateAllowlist(
  env: Record<string, string | undefined> = process.env,
  readFile?: (path: string) => string,
): Set<string> {
  const inline = env.AFFILIATE_ALLOWLIST?.trim();
  if (inline) {
    return new Set(
      inline.split(',').map((a) => normalizeAddress(a)).filter((a) => a.length > 0),
    );
  }

  const filePath = env.AFFILIATE_ALLOWLIST_FILE?.trim();
  if (filePath && readFile) {
    const lines = readFile(filePath).split('\n');
    const addrs = lines
      .map((l) => l.replace(/#.*$/, '').trim()) // strip `#` comments
      .filter((l) => l.length > 0)
      .map((l) => normalizeAddress(l));
    return new Set(addrs);
  }

  return new Set(PLACEHOLDER_AFFILIATE_ALLOWLIST.map((e) => normalizeAddress(e.address)));
}

// ===========================================================================
// OPEN-4 — Dust floor (Filter 2: anti-spam wash)
// ===========================================================================
//
// CHOSEN ASSUMPTION (documented, not a magic literal):
//   Default dust floor = 10_000 micro-USD = $0.01 (one US cent).
//
// REASONING:
//   * Unit is micro-USD, matching x402_settlements.actual_micro and the
//     loa-freeside ledger convention `MICRO_PER_CENT = 10_000`
//     (src/services/x402-settlement.ts:116). One cent is the smallest unit the
//     existing quote/settle math already reasons in, so it is the natural
//     "below this is noise" boundary.
//   * A wash-trading / spam farm drives up settlement COUNT cheaply with
//     sub-cent payments; a genuine arms-length API call is worth ≥ 1¢. Dropping
//     strictly-below-1¢ settlements removes the cheapest farming vector without
//     touching realistic demand.
//   * It is a floor, not a fee: it changes nothing on-chain and collects
//     nothing (read-only PoC). It only decides what the meter COUNTS.
//
// TUNABLE: override via DUST_FLOOR_MICRO. Set to 0 to disable the filter
// entirely (every non-negative settlement clears the floor).
export const DEFAULT_DUST_FLOOR_MICRO = 10_000n; // $0.01

/** Resolve the dust floor (micro-USD) from env, falling back to the default. */
export function resolveDustFloorMicro(
  env: Record<string, string | undefined> = process.env,
): bigint {
  const raw = env.DUST_FLOOR_MICRO?.trim();
  if (raw === undefined || raw === '') return DEFAULT_DUST_FLOOR_MICRO;
  const parsed = BigInt(raw); // throws on garbage — fail loud, never silently mis-floor
  if (parsed < 0n) throw new Error(`DUST_FLOOR_MICRO must be >= 0, got ${raw}`);
  return parsed;
}

// ===========================================================================
// OPEN-5 — Weighting (filters 4-5) vs binary (filters 1-3) reconciliation
// ===========================================================================
//
// THE RECONCILIATION (so an external party gets the SAME headline number):
//
//   The headline `score = qualified_micro / raw_micro ∈ [0,1]` is a ratio of
//   UNWEIGHTED sums of `actual_micro`. Only the THREE BINARY GATES decide
//   membership in `qualified_micro`:
//       Filter 1 affiliate exclusion   (drop)
//       Filter 2 dust floor            (drop)
//       Filter 3 circular-flow         (drop)
//   A settlement is in qualified_micro iff it passes all three. No weight ever
//   multiplies a settlement's contribution to the headline. This is why the
//   headline is reproducible from the binary rules alone.
//
//   Filters 4-5 (wallet-age weighting, external-origin bonus) are DIAGNOSTIC
//   WEIGHTS. They are computed and published in the methodology breakdown as a
//   separate `confidence_weighted_qualified_micro` signal, but they DO NOT enter
//   the headline score. Spec §5 describes 4-5 as "down-weight / up-weight"
//   (continuous), which is incompatible with a clean ratio in [0,1]; rather than
//   silently fold a continuous weight into the headline (which would make the
//   number un-reproducible without sharing the exact weight curve), we surface
//   them as diagnostics. This is sdd.md §4.3 option (a), recorded as the OPEN-5
//   decision.
//
// The age-weight curve below is therefore documentation, not headline math:
//   ageWeight(d) = clamp(AGE_WEIGHT_FLOOR + (1-AGE_WEIGHT_FLOOR)*min(d,FULL)/FULL, floor, 1)
//   originMultiplier = hasExternalOrigin ? EXTERNAL_ORIGIN_BONUS : 1.0
export interface WeightingParams {
  /** Wallet age (days) at which the age weight reaches its max of 1.0. */
  ageFullTrustDays: number;
  /** Minimum age weight for a brand-new wallet (age 0). */
  ageWeightFloor: number;
  /** Diagnostic multiplier applied when a payer has external (CEX/bridge) origin. */
  externalOriginBonus: number;
}

export const DEFAULT_WEIGHTING: WeightingParams = {
  ageFullTrustDays: 30, // a wallet ≥30d old is treated as fully "aged" for the diagnostic
  ageWeightFloor: 0.1, // a 0-day wallet still carries 10% diagnostic weight
  externalOriginBonus: 1.25, // CEX/bridge-funded payers get a 25% diagnostic up-weight
};

export function resolveWeightingParams(
  env: Record<string, string | undefined> = process.env,
): WeightingParams {
  const num = (key: string, dflt: number): number => {
    const raw = env[key]?.trim();
    if (raw === undefined || raw === '') return dflt;
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`${key} must be a finite number, got ${raw}`);
    return v;
  };
  return {
    ageFullTrustDays: num('AGE_FULL_TRUST_DAYS', DEFAULT_WEIGHTING.ageFullTrustDays),
    ageWeightFloor: num('AGE_WEIGHT_FLOOR', DEFAULT_WEIGHTING.ageWeightFloor),
    externalOriginBonus: num('EXTERNAL_ORIGIN_BONUS', DEFAULT_WEIGHTING.externalOriginBonus),
  };
}

/** Methodology version stamped into every service's output (bump on rule changes). */
export const ORACLE_METHODOLOGY_VERSION = '1.0.0';
