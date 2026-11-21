Create or update issues for at most one confirmed first-party dependency workaround root cause; do not change code or open a PR.

<!-- harness-scheduled-completion: issue -->

This is evidence gathering and issue maintenance, not dependency maintenance. [upstream-adoption.md](upstream-adoption.md) removes a workaround once its fix is released. First-party packages are listed in `pnpm-release-age-policy.permanentPackages` in [`.no-mistakes/rules/policies.yml`](../../../.no-mistakes/rules/policies.yml); resolve each owning repository from its published `package.json` (`npm view <package> repository.url`), never from memory. Do not dispatch exploration or review subagents; do a separate confidence review before any mutation, then create issues through the `github-issue` skill.

## Audit and selection

1. Run `pnpm run no-mistakes` and keep its output as evidence.
2. Compare the `permanentPackages` registry with direct `dependencies`, `devDependencies`, and `optionalDependencies` in every `package.json`, `pnpm-workspace.yaml` `minimumReleaseAgeExclude`, `.github/dependabot.yml` npm `cooldown.exclude`, and `pnpm-lock.yaml`. A package is active only when a `package.json` declares it directly; transitive lockfile entries are not. Missing active packages and stale registry entries are candidates. This audit is npm-only.
3. Search for local friction with first-party packages: pnpm overrides and package extensions, release-age or build exemptions, ambient declarations, deep `dist/src` imports, wrappers duplicating public APIs, suppressions, and comments or docs citing upstream limitations.
4. Verify each candidate against the installed version, the latest release and public API, the owning repository's source, tests, and issue history. A confirmed finding needs exact local evidence, a root cause, impact, and why it is a workaround rather than intentional policy or an extension point. Reject speculative enhancements, intentional integrations, and findings already tracked with unchanged evidence.
5. Select at most one root cause (correctness or security first, then install or release failures, then maintenance; ties by oldest verified evidence, then lexical key). Stop without changes if none qualifies.

## Deduplication and disposition

Use this marker, with a lowercase kebab-case root-cause slug:

`<!-- first-party-workaround-key: jonathanong/<repo-name> | <root-cause-slug> -->`

Search open and closed Vouchington issues for the marker, package and symbols, equivalent wording, and linked PRs. Reopen nothing and create no duplicate; a closed match permits a new issue only when the workaround still exists or regressed and the body links the closed issue and explains the distinct removal scope. Update an open issue only with material new evidence.

Dispositions, with verified tracked or fixed state taking precedence:

- Untracked upstream defect: one issue with the copy-paste-ready upstream section from the `github-issue` Issue Body template.
- Upstream already fixed or tracked: one issue referencing that issue, PR, release, or API, stating the local removal criteria.
- Stale local duplication or registry drift only: one issue explaining why the upstream section is omitted.
- All candidates tracked with unchanged evidence: no-op.

Every issue is labeled `dependencies` and carries exactly one existing priority (default medium; high only with live impact; low for documentation-only or minor CLI ergonomics), open milestones only. Each contains the marker and concise sections for: context and package version; exact local files and symbols; verified root cause and upstream evidence; the smallest long-term approach; measurable removal criteria as plain bullets; and the run URL. Report the representative issue number, or a concise no-op reason. Do not install or upgrade dependencies, close issues, or merge pull requests.
