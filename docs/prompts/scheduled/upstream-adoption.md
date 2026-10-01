Review released upstream changes against local workarounds and local copies of package features. Pick at most one concrete, bounded removal or adoption that is safe to ship in one PR.

[First-Party Dependencies](../../development/first-party-dependencies.md) owns package ownership and
the wrappers that intentionally stay local. [Dependency Updates](../../development/dependency-updates.md)
owns installs, lockfiles, release delays and version policy. The
[first-party dependency audit](first-party-dependencies.md) tracks upstream defects that are not yet
fixed. This prompt removes local code only after the upstream fix or capability has been released.

## Candidates

Search tracked files (never `node_modules`) for local code that exists because of a package or runtime
limitation, or that copies something a dependency now provides:

- Comments, docs and configuration that cite an upstream limitation or version: workaround notes,
  "until or once a package ships" notes, "at pinned package x.y" caveats, ambient `declare module`
  shims, `packageExtensions`, `ignoredOptionalDependencies`, release-age exemptions, and
  `--experimental-*` or `--disable-warning` runtime flags.
- Test shims that extend a package's own testing mode, and tests that pin a fixed upstream bug
  instead of Voucha behavior.
- Local helpers that copy a public export of a direct dependency. For first-party packages, compare
  against the owning repository's released API. Pay attention to releases that publish a former
  private helper or that extract code from this repository with consumer adoption left as follow-up.
- Generic checks implemented by more than one first-party tool. Prefer the generic `no-mistakes`
  rule once it reaches parity. Until then, report the missing capability.
- Open `dependencies` issues whose `first-party-workaround-key` removal criteria may now be met.
- Capabilities of the Node version in `.node-version` and the Docker base images that replace a
  dependency or a legacy idiom. Prefer enabling an existing lint rule with an autofix over a one-off
  rewrite.

## Verification

For each candidate:

1. Find the resolved version in `pnpm-lock.yaml` and the first release that contains the fix or
   capability. Read the release notes and the source or docs at that release tag, not the default
   branch.
2. Confirm that `minimumReleaseAge` admits the release. If the declared range excludes it, the PR
   must bump every manifest that declares the package and pass `pnpm run syncpack:lint`. Never adopt
   a prerelease, a release candidate or unreleased default-branch code.
3. Confirm that the replacement keeps the caller's contract: errors, cancellation, ordering, return
   shape and runtime constraints. `web/`, `cloudflare-worker/` and Lambdas may lack Node-only APIs.
4. Search open pull requests and issues for the same package and symbols. Skip work that another
   pull request already owns.

Reject:

- Intentional policy that only resembles a workaround, such as an ambient type that narrows `any`
  to `unknown`, or orchestration the ownership doc keeps local.
- Adoption that adds a package or abstraction without deleting local code.
- Anything that needs an unreleased upstream change. Report it as a recommendation with the upstream
  reference and removal criteria.

## Selection and change

Prefer correctness or security defects, then the largest verified deletion, then the oldest local
evidence.

- Delete the workaround or local copy and adapt its callers. Fix callers rather than relaxing
  assertions.
- Delete tests that only pinned upstream behavior, after confirming that the owning boundary still
  covers Voucha behavior.
- Update the owning docs, skills and `AGENTS.md` lines that described the removed workaround.

Validate with the owning commands in [Tests](../../development/tests.md). For dependency or
configuration changes, also run typecheck, Knip, `pnpm run syncpack:lint` and
`pnpm run no-mistakes`. Do not change dependency versions merely to produce a PR.
