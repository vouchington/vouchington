# Dependabot auto-merge

[Back to Dependency Updates](dependency-updates.md#dependabot-auto-merge)

`dependabot-pr-automerge.yml` delegates the generic eligibility and mutation policy to the immutable
`vouchington-tooling` Dependabot auto-merge action. That shared policy enables GitHub squash
auto-merge only for patches at any version and minor updates whose old and new major versions are
both at least 1. Every pre-1.0 minor and every SemVer-major update requires human action. A grouped
PR is automatic only when every dependency is eligible. Groups model verified compatibility families
and include every release type; they never group unrelated packages by update type. Missing,
malformed, unknown, inconsistent, or non-increasing metadata fails closed. The action never submits
a review or approval.

Its trusted `pull_request_target` mutation jobs admit only same-repository `dependabot/*` PRs and
check out no PR code. Enablement additionally requires the default branch as its target and fires
on `opened`, `reopened`, `ready_for_review`, and
`synchronize` — the last one re-evaluates on every push, including a Dependabot rebase, and is the
only reliable re-arm signal; the shared action no-ops when auto-merge is already enabled and the
head still matches, so the repeated trigger is cheap. `edited` was deliberately dropped from the
trigger set: a PR body/title edit isn't a merge-readiness signal, and before
`vouchington-tooling-v0.6.1` the action re-enabled auto-merge unconditionally on every trigger,
which GitHub rejects once a PR is already mergeable — see
[vouchington-tooling#161](https://github.com/vouchington/vouchington-tooling/pull/161) for that
incident and fix, and
[vouchington-tooling#162](https://github.com/vouchington/vouchington-tooling/issues/162) for why
Dependabot never bumped the pin on its own (its release tags didn't match a format Dependabot's
version parser recognizes, fixed going forward in
[vouchington-tooling#163](https://github.com/vouchington/vouchington-tooling/pull/163)).
`vouchington-clients` aligns on the same trigger set for its own consumer workflow. A cleanup-only
job still admits same-repository
Dependabot branches while they target a non-default branch so the shared action can call
`disablePullRequestAutoMerge`. Unsigned or mixed HEAD on an enable event is a successful
human-merge no-op: the job does not fail, and auto-merge is not enabled. Already-armed PRs are
also a no-op. Enablement and cleanup share one per-PR concurrency group. Native-client lock repair
is owned by [vouchington-clients](https://github.com/vouchington/vouchington-clients); Filaments
passes its validated base and head SHAs directly to the shared action. Metadata and PR reads use the job-scoped `github.token`;
only eligible `enablePullRequestAutoMerge` and stale-state `disablePullRequestAutoMerge`
mutations use the separate `DEPENDABOT_AUTOMERGE_TOKEN` Actions secret.
That non-`GITHUB_TOKEN` identity is required so the eventual merge emits normal `main` `push`
workflows instead of being suppressed by GitHub's recursive-workflow guard. A missing merge token,
an unreadable GraphQL response, or a successful response without the requested mutation envelope
fails an eligible mutation closed; drafts, ineligible updates, and already-armed PRs remain
non-mutating no-ops. See [CI Reference](ci.md#dependabot-auto-merge-and-main-push-ci) for the
operational verification contract.

See also the [auto-merge workflow](../../.github/workflows/dependabot-pr-automerge.yml) and the
[CI operational reference](reference-ci-standalone-workflow-checks.md#dependabot-auto-merge-and-main-push-ci),
and the [merge-authority decision flow](reference-merge-authority-decision-flow.md).
