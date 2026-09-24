# Supply-chain policy

[Back to Dependency Updates](dependency-updates.md#supply-chain-policy)

### pnpm hardening flags

Shared npm settings live in `.npmrc` (root). pnpm-specific settings live in `pnpm-workspace.yaml` so npm does not warn about unsupported project config keys.

Vulnerability detection for npm dependencies is owned by GitHub Dependabot and advisory alerts; it
does not block deploys. `audit-level` never made `pnpm install` run or fail an audit, so it is not a
repository setting. Do not add a separate `pnpm audit` or OSV npm scan to CI.

| Setting                     | Value                    | Why                                                                                                                                   |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `engine-strict`             | `true`                   | Fails install if the current Node version doesn't satisfy `engines.node`.                                                             |
| `fund`                      | `false`                  | Silences funding noise; no network calls for fund metadata.                                                                           |
| `update-notifier`           | `false`                  | Disables the pnpm version-update prompt; avoids an outbound network request on every install.                                         |
| `preferFrozenLockfile`      | `true`                   | Refuses to write a new lockfile unless `--no-frozen-lockfile` is passed explicitly.                                                   |
| `strictDepBuilds`           | `true`                   | Fails if a transitive dep tries to run lifecycle scripts but isn't listed in `pnpm-workspace.yaml` `allowBuilds`.                     |
| `verifyDepsBeforeRun`       | `error`                  | Refuses `pnpm run` when `node_modules` is out of sync with the lockfile (e.g. after a rebase without re-running `pnpm install`).      |
| `minimumReleaseAge`         | `2880` (2 days, minutes) | Delays installing packages published fewer than 2 days ago, buying time for the community to detect and retract compromised releases. |
| `dangerouslyAllowAllBuilds` | `false`                  | Explicit: reviewed packages in `allowBuilds` use `true` to permit scripts; all others cannot run them.                                |

`ignoredOptionalDependencies` contains only `sharp`, which suppresses Next's optional Sharp
resolution. The web workspace owns the patched implementation directly with `sharp@^0.35.3`, and
its build rejects Sharp versions older than 0.35.

### Dependabot cooldown and pnpm `minimumReleaseAge`

All release delays are two days. Dependabot applies its configured two-day cooldown to normal
version updates; Dependabot security updates do not honor cooldown and remain eligible immediately.
pnpm's `minimumReleaseAge` is independent: a Dependabot PR does not bypass pnpm's two-day install
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

`setup-node-pnpm` runs one `pnpm install --frozen-lockfile`. A lockfile entry newer than
`minimumReleaseAge` fails it immediately with pnpm's own error:

```
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 1 lockfile entries failed verification:
  undici@8.10.0 was published at 2026-08-03T15:06:33.000Z, within the minimumReleaseAge cutoff (2026-08-02T04:48:10.357Z)
```

The failure is permanent until the flagged release ages past the cutoff: it becomes installable at
its publish time plus `minimumReleaseAge` (from `pnpm-workspace.yaml`), and re-running the job
before then fails the same way. A PR blocked this way needs no action other than waiting past that
time (or `@dependabot rebase` once it has passed) — see the temporary exemption procedure above only
if the delay is itself the problem.

### Contents

- <a id="first-party-release-gate-exemptions"></a>[First-party release-gate exemptions](reference-dependency-updates-first-party-release-gate-exemptions.md)

### Registry-only dependency rule

All `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies` in every workspace `package.json` must resolve from the npm registry. The following specifier types are hard-blocked:

- `git:`, `git+ssh:`, `git+https:`, `git+http:`, `git+file:`
- `github:`, `gitlab:`, `bitbucket:`, `gist:`
- `http:`, `https:` (tarball URLs)
- `file:`, `link:`, `portal:`

`npm:` package aliases are allowed only when the aliased version is itself a registry specifier (e.g. `npm:lodash@^4` is fine; `npm:foo@github:attacker/foo` is blocked).

Lockfile resolutions are also checked: any `pnpm-lock.yaml` package entry with a `tarball`, `repo`, `commit`, or `directory` resolution field is flagged.

Enforcement: `pnpm run no-mistakes` via the `package-json-registry-only` rule in `.no-mistakes.yml`.
