Create or update issues for exactly one concrete, bounded first-party dependency workaround root cause; do not change code or open a PR.

<!-- harness-scheduled-completion: issue -->

Use [First-Party Dependencies](../../development/first-party-dependencies.md) as the ownership
source of truth. This run is an evidence-gathering and issue-maintenance task, not dependency
maintenance or workaround removal.

## Execution boundary

- This privileged scheduled run must not dispatch read-only Codex exploration or self-review roles.
  The main agent performs the evidence gathering and a separate confidence review before any
  mutation.
- Treat issue creation and mutation as implementation work. Delegate it serially to one
  `gpt-5.6-terra` subagent that invokes `$github-issue` and follows that skill's live-taxonomy,
  duplicate-search, verification, and Jonathan-owned-repository guardrails. Do not dispatch it
  until the confidence review confirms the evidence and proposed disposition.

## Audit and selection

1. Run `pnpm run no-mistakes` and retain its output as audit evidence.
2. Read the authoritative `pnpm-release-age-policy` `permanentPackages` registry in
   `.no-mistakes.yml` and compare it with the
   ownership table and these npm policy surfaces:
   - direct `dependencies`, `devDependencies`, and `optionalDependencies` in every root and
     workspace `package.json`;
   - `pnpm-workspace.yaml` `minimumReleaseAgeExclude` entries;
   - `.github/dependabot.yml` npm `cooldown.exclude` entries; and
   - resolved versions in `pnpm-lock.yaml`.
3. Classify a package as active only when a root or workspace `package.json` declares it directly in
   one of those three dependency fields. Transitive-only `pnpm-lock.yaml` entries are not active.
   Include missing active packages and stale registry entries in the candidate set. This registry
   audit is npm-specific; do not expand it to Swift or .NET dependency manifests.
4. Search for local friction involving first-party packages, including pnpm overrides and package
   extensions, release-age or build exemptions, ambient declarations, deep `dist/src` imports,
   wrappers duplicating public package APIs, suppressions, and comments or docs citing upstream
   limitations.
5. Verify each candidate against the installed version, the latest upstream release and public API,
   the owning repository's current source and tests, and relevant issue or pull-request history.
   A confirmed finding needs exact local evidence, a root cause, user or maintenance impact, and a
   clear explanation of why the local code is a workaround rather than an intentional application
   policy or extension point.
6. Reject speculative enhancements, intentional integrations, and findings already fully tracked
   with unchanged evidence. Do not create a ticket merely because an abstraction could be broader.
7. Select exactly one confirmed root cause. Prefer correctness or security defects, then install or
   release failures, then maintenance cleanup. Break ties by the oldest verified local evidence,
   then by the lexical workaround key defined below.

## Deduplication and disposition

Derive one stable, lowercase kebab-case root-cause slug and use this exact marker in the issue:

`<!-- first-party-workaround-key: jonathanong/<repo-name> | <root-cause-slug> -->`

For example:

`<!-- first-party-workaround-key: jonathanong/no-mistakes | selector-wrapper-coverage-edge -->`

Search open and closed issues in Filaments for the marker, affected package and symbols, equivalent
root-cause wording, and linked pull requests. Reopen nothing and create no duplicate. When the only
match is closed and the current workaround still exists or has regressed, a new issue is allowed
only when its body references the closed issue and explains the materially distinct active removal
scope. Update an existing open issue only when this run adds material evidence or changes its
completion criteria; do not post unchanged audit comments.

Process the selected root cause using exactly one of these dispositions:

Verified tracked or fixed state takes precedence over an untracked classification.

- For an untracked upstream defect, create or materially update only one Filaments issue, labeled
  `dependencies`, whose body includes the copy-paste-ready upstream section from the
  [github-issue skill](../../../.agents/skills/github-issue/SKILL.md) Issue Body template. Place
  the marker in its body.
- When upstream already fixed or tracked the defect, create or materially update only one Filaments
  issue, labeled `dependencies`. Reference the upstream issue, pull request, release, or public API,
  state the local removal criteria, and keep the upstream section pointed at that existing tracker
  instead of a fresh filing.
- When the problem is solely stale local duplication or registry drift, create or materially update
  only one Filaments issue, labeled `dependencies` because it still tracks a first-party-dependency
  concern, and explain why the upstream section is omitted: this disposition is not an upstream
  defect.
- When all confirmed candidates are already tracked and their evidence is unchanged, make the run a
  no-op.

## Issue contract

Use only labels that currently exist in the target repository and only open milestones. Apply the
`dependencies` label to every issue this audit creates or materially updates. Give each Filaments
issue exactly one canonical priority; default to medium unless live impact supports high or the
finding is documentation-only or minor CLI ergonomics that supports low. Do not create or rename
taxonomy.

Each created or materially updated issue must contain the marker and concise sections covering:

- context and affected package version;
- exact local files, symbols, configuration, or reproducible behavior;
- verified root cause and upstream evidence;
- the smallest long-term implementation approach;
- measurable completion and workaround-removal criteria as ordinary bullets, not task checkboxes;
- the scheduled workflow run URL.

The Filaments follow-up is the representative issue for automation. If this run creates or
materially updates one, verify its final open state and report its bare numeric issue number. For a
no-op, report a concise reason.

Do not change repository files, install or upgrade dependencies, create a branch, push, or open a
PR. Do not close issues or merge pull requests.
