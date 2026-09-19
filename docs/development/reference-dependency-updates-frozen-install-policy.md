# Frozen-install policy

[Back to Dependency Updates](dependency-updates.md#frozen-install-policy)

The scheduled [dependency-maintenance prompt](../prompts/scheduled/dependencies.md) audits the
Filaments package ecosystem against this policy. A dependency change is complete only when its authoritative
manifest or toolchain pin and every derived lock agree, a frozen resolution succeeds, and the PR
records the candidate source and command output used as evidence.

| Ecosystem | Authoritative state                                                                                                        | Update ownership                                                                                                                                 | Frozen verification              |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| pnpm      | Workspace `package.json` manifests, root `package.json` `packageManager`, `pnpm-workspace.yaml`, and root `pnpm-lock.yaml` | Dependabot for registry dependencies and the lockfile; Renovate for the pnpm toolchain pin; manual for reviewed temporary release-age exemptions | `pnpm install --frozen-lockfile` |

SwiftPM and NuGet dependency policy is owned by
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients); Filaments
does not regenerate or validate native dependency locks.

### pnpm

The npm registry metadata for the exact package version is the canonical publication source;
workspace manifests declare intent and `pnpm-lock.yaml` records the resolved graph. Regenerate the
lock only with an explicit non-frozen `pnpm install`, review the manifest and lock diff together,
then rerun `pnpm install --frozen-lockfile`, Knip, typecheck, Syncpack, and no-mistakes checks.
`pnpm-workspace.yaml` is authoritative for the release-age gate and lifecycle-script build policy;
do not bypass either to make a candidate resolve.

Do not use dependency version overrides. Top-level `overrides` in `pnpm-workspace.yaml`,
package-level `overrides`, and `pnpm.overrides` in any workspace `package.json` are banned because
Dependabot does not maintain those version substitutions and they can silently mask stale or invalid
upstream metadata. Fix bad metadata through an upstream release or upgrade the parent dependency.
`packageExtensions` remains allowed for correcting dependency metadata without forcing versions.
`pnpm run no-mistakes` enforces the override ban (`pnpm-overrides-ban`).

Persistent pnpm state on self-hosted runners is operational reuse, not authoritative resolution
state. CI does not use a package-manager cache action. Any future dependency cache key must include
`pnpm-lock.yaml`, all relevant workspace manifests, and the pinned Node/pnpm toolchain.

### Audit evidence

Start with manifest/lock diffs and authoritative registry or release metadata. Record exact current
and candidate versions, publication/release timestamps where relevant, update ownership, every lock
expected to change, and the frozen commands that passed. Do not run native restores for a static
candidate scan; run them when the selected improvement changes a native manifest, lock, pin, or
dependency workflow.

### pnpm workspace lockfile note

Dependabot's `npm` ecosystem reliably updates `pnpm-lock.yaml` only when its `directory:` points to the directory that **owns** the lockfile (the repo root). Per-workspace entries (`directory: '/backend'`, `directory: '/web'`, etc.) cause Dependabot to edit the workspace `package.json` without regenerating the root lockfile, producing `ERR_PNPM_OUTDATED_LOCKFILE` in CI on every PR it opens. Use a single `directory: '/'` entry and let Dependabot follow `pnpm-workspace.yaml` to discover all packages.

Dependabot updates registry dependencies declared by workspace manifests, but it does not parse the
`overrides` map in `pnpm-workspace.yaml`. PR #5159 therefore updated the direct
`@jongleberry/vurst-*` requirements while leaving a parent-scoped override on the old version. Do
not add or rely on dependency-version overrides as automation-managed pins; fix the upstream
package metadata or upgrade the parent dependency instead. Removing the remaining overrides and
enforcing that policy is tracked as a follow-up (formerly filed as jonathanong/filaments#7794).
`packageExtensions`, which correct dependency metadata without
forcing a version, is outside that ban.
