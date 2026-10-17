# Frozen-install policy

[Back to Dependency Updates](dependency-updates.md#frozen-install-policy)

The scheduled [dependency-maintenance prompt](../prompts/scheduled/dependencies.md) audits the
Vouchington package ecosystem against this policy. A dependency change is complete only when its authoritative
manifest or toolchain pin and every derived lock agree, a frozen resolution succeeds, and the PR
records the candidate source and command output used as evidence.

| Ecosystem | Authoritative state                                                                  | Update ownership                                                                                            | Frozen verification              |
| --------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| pnpm      | Workspace `package.json` manifests, `pnpm-workspace.yaml`, and root `pnpm-lock.yaml` | Dependabot for registry dependencies and the lockfile; manual for reviewed temporary release-age exemptions | `pnpm install --frozen-lockfile` |

SwiftPM and NuGet dependency policy is owned by
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients); Vouchington
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

The pnpm store cache on ephemeral GitHub-hosted runners is download reuse, not authoritative
resolution state. Its key includes the runner OS and architecture plus a content hash of
`pnpm-lock.yaml`; the frozen lockfile remains the resolution contract.

### Dependabot and the workspace lockfile

Dependabot's `npm` ecosystem updates `pnpm-lock.yaml` reliably only when its `directory:` is the
directory that owns the lockfile (the repo root); per-workspace entries edit `package.json` without
regenerating the lock and fail CI with `ERR_PNPM_OUTDATED_LOCKFILE`. Dependabot also does not parse
the `overrides` map in `pnpm-workspace.yaml`, which is why dependency-version overrides are banned
above: a parent-scoped override can keep an old version after the direct requirement is bumped.

### <a id="optional-peer-instance-keys"></a>Optional peer instance keys

pnpm records each resolved optional peer in the dependent package's lockfile instance key.
`openai` optionally peers `undici`, so a workspace package that declares `undici` directly and a
package that only receives `undici` as `openai`'s auto-installed peer become two copies of
`openai` when those versions differ. `instanceof` on SDK error classes is then false across that
boundary: `backend/test-helpers` constructs `APIError`, and `backend/modules/openai-utils`
classifies it.

Dependabot updates `undici` where a manifest declares it and can leave the auto-installed peer on
the previous release. Rebasing leaves that split in place. Point every `openai` importer and
package instance at the same `undici` version as the direct workspace dependency, drop the extra
snapshot, and keep
[`ci/openai-peer-resolution.test.mts`](../../ci/openai-peer-resolution.test.mts) green. Overrides
remain banned. A full `pnpm dedupe` also collapses unrelated duplicates, so an `undici` bump keeps
only the peer-key edit.
