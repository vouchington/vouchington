Create or update at most one concrete, bounded CI job runtime issue; do not change code or open a PR.

<!-- harness-scheduled-completion: issue -->

Run `node ci/ci-job-runtime-audit.mts` (wrapper over `vouchington-tooling/gha-runtime-audit`) and parse its JSON. It measures execution time only, over the 10 most recent completed pull-request runs targeting `main` per selected workflow, keeping at most the latest five successes per workflow/job. Do not describe results as exhaustive history.

- No violations: report that no sampled job breached the policy; create no issue or comment.
- Otherwise take the highest-ranked violation and search all open issues, without a label filter, for the marker `<!-- ci-job-runtime-key: WORKFLOW / JOB -->`.
- Untracked: create one issue. Tracked, with untracked lower-ranked violations: create one issue for the highest-ranked untracked one. Everything tracked: comment on the highest-ranked violation's issue with the latest evidence.

Title `CI runtime: WORKFLOW / JOB exceeds the performance budget`. A new issue or comment carries the marker, sample count, every sampled duration, eligible five-sample median, maximum, violation reasons (`sample-at-or-above-hard-ceiling`, `five-sample-median-above-threshold`), and links to every sampled job and run. State that the target is about eight minutes via fewer, longer-running shards and ten minutes is a hard performance ceiling, not a timeout. Apply `github_actions` and `automation`, plus `priority: high` when any sample is at least ten minutes, otherwise `priority: medium`. Report the representative issue number.
