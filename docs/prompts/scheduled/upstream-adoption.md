Review released upstream changes against local workarounds and local copies of package features. Pick at most one concrete, bounded removal or adoption that is safe to ship in one PR.

Unit: one package.

`pnpm-release-age-policy.permanentPackages` in [`.no-mistakes/rules/policies.yml`](../../../.no-mistakes/rules/policies.yml) lists the first-party packages; find each owner via `npm view <package> repository.url`. [Dependency Updates](../../development/dependency-updates.md) owns installs, lockfiles, and release delays. [first-party-dependencies.md](first-party-dependencies.md) tracks upstream defects not yet fixed; this prompt removes local code only after the fix or capability is released. Load `dependency-rules`.

## Candidates

Search tracked files (never `node_modules`) for:

- Comments, docs, and config citing an upstream limitation or version: workaround notes, "until a package ships" caveats, ambient `declare module` shims, `packageExtensions`, `ignoredOptionalDependencies`, release-age exemptions, and `--experimental-*` or `--disable-warning` flags.
- Test shims extending a package's testing mode, and tests pinning a fixed upstream bug rather than Voucha behavior.
- Local helpers copying a public export of a direct dependency (including a former private helper now published or code extracted from this repo awaiting adoption).
- Generic checks implemented by more than one first-party tool: prefer the `no-mistakes` rule once at parity, else report the missing capability.
- Open `dependencies` issues whose `first-party-workaround-key` removal criteria may now be met.
- Node features in `.node-version` and the Docker base images that replace a dependency or legacy idiom (prefer enabling an autofix lint rule).

## Verification

1. Find the resolved version in `pnpm-lock.yaml` and the first release with the fix, reading notes and source at that release tag.
2. Confirm `minimumReleaseAge` admits it; if the range excludes it, bump every declaring manifest and pass `pnpm run syncpack:lint`. Never adopt a prerelease or unreleased code.
3. Confirm the replacement keeps the caller's contract (errors, cancellation, ordering, return shape); `web/`, `cloudflare-worker/`, and Lambdas may lack Node-only APIs.
4. Skip work owned by an open PR or issue.

Reject intentional policy resembling a workaround (such as a type that narrows `any` to `unknown`), adoption that adds a package without deleting local code, and anything needing an unreleased change (report it with the upstream reference and removal criteria).

## Selection and change

Prefer correctness or security defects, then the largest verified deletion, then the oldest evidence. Delete the workaround and adapt callers rather than relaxing assertions; delete tests that only pinned upstream behavior once the owning boundary still covers Voucha behavior; update docs, skills, and `AGENTS.md` lines describing it. Validate per [Tests](../../development/tests.md); for dependency or config changes also run typecheck, Knip, `pnpm run syncpack:lint`, and `pnpm run no-mistakes`. Do not bump versions merely to produce a PR.
