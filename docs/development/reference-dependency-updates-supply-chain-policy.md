# Supply-chain policy

[Back to Dependency Updates](dependency-updates.md#supply-chain-policy)

### pnpm hardening

Shared npm settings live in `.npmrc`; pnpm-specific settings (`minimumReleaseAge`, `allowBuilds`,
`strictDepBuilds`, frozen-lockfile preference) live in `pnpm-workspace.yaml`. Vulnerability detection
for npm dependencies is owned by GitHub Dependabot and advisory alerts and does not block deploys; do
not add a separate `pnpm audit` or OSV npm scan to CI.

### Dependabot cooldown and pnpm `minimumReleaseAge`

All release delays match. Dependabot applies its configured cooldown to normal
version updates; Dependabot security updates do not honor cooldown and remain eligible immediately.
pnpm's `minimumReleaseAge` is independent: a Dependabot PR does not bypass pnpm's install
gate, and pnpm does not change Dependabot's scheduling.

For a reviewed urgent pnpm release, add only the exact `package@version` selector to
`minimumReleaseAgeExclude` in `pnpm-workspace.yaml`; scoped packages use
`@scope/package@version`. Add the same selector to a `temporaryGroups` entry under
`pnpm-release-age-policy` in `.no-mistakes.yml`. That checked-in configuration is the audit trail: it records the selector set, rationale, and
`eligibleForRemovalAt` timestamp.

Ranges, tags, and globs are forbidden for temporary exemptions. `no-mistakes` retains
exact-selector, duplicate, YAML/registry drift, and lockfile-orphan checks, but an eligible removal
timestamp no longer fails CI. For each group, `eligibleForRemovalAt` is the whole-second ceiling of
the latest selector's npm publication timestamp plus `minimumReleaseAge` minutes. Never round down,
broaden a selector, or extend an exemption.

The scheduled dependency audit checks groups before other work. It corrects metadata drift
immediately and batches every eligible group plus every selector orphaned from `pnpm-lock.yaml` into
one cleanup PR. If all future groups are valid and no exemption work is actionable, the audit
continues with ordinary dependency maintenance rather than opening a findings-only PR.

**First-party packages** published from an audited default-branch workflow through npm trusted
publishing (OIDC) are permanently exempt from both delays. Add each exact npm package name to
`minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. In `.github/dependabot.yml`, the verified
`@jongleberry/*` and `@vouchington/*` release families use those scoped patterns in both
`cooldown.exclude` and `groups.first-party.patterns`; unscoped first-party packages remain exact
entries in both lists. This lets Dependabot open PRs and `pnpm install` resolve the verified
first-party release immediately.

The `pnpm-release-age-policy` rule enforces the pnpm registry: it fails if it drifts from
`pnpm-workspace.yaml`, if a first-party package under a known first-party scope appears in tracked
manifests or `pnpm-lock.yaml` without a registry entry, if a registry entry is no longer present in
tracked manifests or `pnpm-lock.yaml`, or if a temporary selector is broad, duplicated, or orphaned
from the lockfile. The Dependabot policy test keeps the scoped/exact cooldown and first-party-group
patterns synchronized. Eligible temporary removal timestamps are audit signals, not CI failures. The
`structured-config-policy` rule separately requires a positive `minimumReleaseAge` and strict
boolean `allowBuilds` values.

### Release-age violations fail the install

A lockfile entry newer than `minimumReleaseAge` fails `pnpm install --frozen-lockfile` with
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. The failure is permanent until the release ages past the
cutoff, so re-running does not help; wait (or `@dependabot rebase` afterwards), and use the temporary
exemption procedure above only if the delay is itself the problem.

### Registry-only dependency rule

Every workspace dependency must resolve from the npm registry; git, URL, file, link, and portal
specifiers and non-registry lockfile resolutions are blocked by the `package-json-registry-only`
rule in `.no-mistakes.yml`. `npm:` aliases are allowed only to registry specifiers.
