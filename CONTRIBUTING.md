# Contributing to loa-arcturus

Thank you for your interest in contributing. loa-arcturus is an open-source
(AGPL-3.0) anti-sybil **Proof-of-Revenue oracle** for the Berachain agent
economy. Before contributing, please read `ROLE3-ORACLE-SPEC.md` — it is the
authoritative specification, and the project's scope guardrails (read-only,
fee-free, PoL-free) are non-negotiable.

## License

By contributing to this repository you agree that your contributions are
licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0), the
same license as the project (see `LICENSE`).

loa-arcturus derives from `loa-freeside` (AGPL-3.0 → AGPL-3.0). See `NOTICE`
and `PROVENANCE.md` for attribution and per-file provenance.

## Developer Certificate of Origin (DCO)

**All contributions MUST be signed off** under the
[Developer Certificate of Origin](https://developercertificate.org/) (DCO).
The DCO is a lightweight, per-commit attestation that you wrote the patch or
otherwise have the right to submit it under the project's license. We use the
DCO (not a CLA) to keep inbound contribution terms consistent and frictionless.

### How to sign off

Add a `Signed-off-by` line to every commit, matching your real name and the
email you commit with:

```
Signed-off-by: Jane Developer <jane@example.com>
```

Git can add this automatically with the `-s` / `--signoff` flag:

```bash
git commit -s -m "Your commit message"
```

A commit without a valid `Signed-off-by` line will not be accepted.

### The DCO text you are certifying

```
Developer Certificate of Origin
Version 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## CLA (later / optional)

A Contributor License Agreement is **not** required today. A CLA may be
introduced later if the project needs relicensing flexibility
(`ROLE3-ORACLE-SPEC.md:57-58`); if that happens it will be announced and
documented here. For now, the DCO sign-off above is the only inbound
requirement.

## Provenance honesty (project-defining)

This is an anti-fraud project: the meter's credibility *is* the product.
Contributions are held to the same provenance discipline as the codebase:

- **Preserve upstream headers** on any file derived from `loa-freeside`, and
  keep its `Provenance:` header block accurate.
- **Pin real dependency versions** against actual upstream manifests — never
  invent a version.
- **Never resolve an UNVERIFIED fact by guessing.** Items marked `[UNVERIFIED]`
  (e.g. the HONEY token standard) must stay marked until confirmed against an
  authoritative source, with the source cited.
- **No silent schema invention.** Migration/schema decisions are documented
  with provenance (see `migrations/PROVENANCE.md`).

## Scope guardrails

Pull requests that introduce on-chain **fee, treasury, or PoL-emission** logic,
or that weld the Role-3 oracle to Role-1 emission gating, are out of scope for
this PoC and will be declined (`ROLE3-ORACLE-SPEC.md:11-16, 211-219`).
