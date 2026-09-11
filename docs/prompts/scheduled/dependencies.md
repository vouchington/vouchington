Review Filaments pnpm dependency maintenance. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

Use [`docs/development/dependency-updates.md`](../../development/dependency-updates.md) as the
source of truth for ownership, frozen-install commands, lockfiles, cache isolation, and audit
evidence. Do not duplicate or weaken that policy here.

## Action steps

1. Audit temporary pnpm release-age exemptions before considering other work:
   - Run `pnpm run no-mistakes`.
   - Read grouped `temporaryGroups` under `pnpm-release-age-policy` in `.no-mistakes.yml`. For every exact selector, obtain its
     npm registry publication timestamp. Read `minimumReleaseAge` from `pnpm-workspace.yaml` in
     minutes; each group's `eligibleForRemovalAt` must equal the whole-second ceiling of its latest
     selector publication plus that delay.
   - Actionable work exists when metadata drifts, any group is eligible, or any selector is absent
     from `pnpm-lock.yaml`, including when no group is eligible. Correct any metadata drift
     immediately. Remove all eligible groups and all orphaned selectors in one combined cleanup PR.
     Never broaden a selector or extend an exemption.
   - Treat all actionable exemption work (metadata drift, eligible groups, or orphaned selectors)
     as the one bounded improvement for this run. Do not create or check cleanup issues.
   - When every future group is valid and none is actionable, continue with the ordinary dependency
     audit. Do not open a findings-only PR solely because future exemptions exist.

2. Audit pnpm dependency hygiene:
   - Run `pnpm install`, `pnpm exec knip --treat-config-hints-as-errors`, and
     `pnpm run knip:production-exports`.
   - Check each `knip.jsonc` `ignoreDependencies` entry with `git grep`, excluding
     `pnpm-lock.yaml` and `knip.jsonc`. Keep only genuine CLI-only dependencies that are invoked but
     never imported. Remove a stale ignore when an import is traceable; remove an unused dependency
     from every declaring workspace when it has no real source, config, script, or binary reference.
   - For concrete non-`@types/*` candidates reported outside the ignore list, verify references in
     source, config, and `package.json` `scripts`/`bin`. Prefer a real entry point or plugin for an
     untraceable edge; do not hide it with a new ignore.
   - Inspect low-importer direct dependencies whose sole caller duplicates an existing repository seam.
     Select a safe consolidation or removal only when import, runtime, and package-boundary evidence
     establishes that the replacement preserves the caller's contract.

3. This rotation covers only the Filaments pnpm workspace. Native dependency maintenance belongs to
   [`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients) and is
   outside this prompt's scope.

4. Select exactly one evidence-backed improvement. Keep dependency graphs explicit and frozen
   state reproducible; do not weaken checks, resolution strictness, or dependency coverage.

5. Verify the selected ecosystem with the central policy's commands plus its focused build/tests.
   For pnpm dependency changes also run Knip, typecheck, `pnpm run syncpack:lint`, and
   `pnpm run no-mistakes`.

6. Ship exactly one bounded PR. If no independently mergeable improvement is supported by the
   evidence, stop and report that outcome without publishing anything.
   An issue-only or findings-only fallback is forbidden.

## Notes

- Borderline first-party npm packages whose only references are documentation or automation require
  owner judgment; report the evidence rather than removing them unilaterally.
- Do not change dependency versions merely to produce a PR. Every lock or pin change must trace to
  an authoritative manifest or toolchain source and pass a frozen re-resolution check.
