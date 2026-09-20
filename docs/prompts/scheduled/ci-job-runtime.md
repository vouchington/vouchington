Create or update exactly one concrete, bounded CI job runtime issue; do not change code or open a PR.

<!-- harness-scheduled-completion: issue -->

Run `node ci/ci-job-runtime-audit.mts` (Vouchington wrapper over
`vouchington-tooling/gha-runtime-audit`) and parse its JSON output. The audit measures execution
time only, excluding queue time. For each selected workflow, it checks the 10 most recent completed
in-scope runs: `CI` pull requests targeting `main` and `Main CI (*)` pushes on `main`. Within that deterministic recent-run horizon, it retains at most
the latest five successful executions per exact workflow/job name. Do not describe the results as
exhaustive history beyond that horizon.

- If there are no violations, report that no sampled job breached the policy. Do not create or
  comment on an issue.
- Otherwise, process only the highest-ranked violation. Search all open issues without a label
  filter for the exact canonical key in a standalone marker:
  `<!-- ci-job-runtime-key: WORKFLOW / JOB -->`.
- If that violation is untracked, create exactly one issue. If it is already tracked and lower-ranked
  violations are untracked, create one issue for the highest-ranked untracked violation instead.
- If every violation is already tracked, comment on the issue for the highest-ranked violation with
  the latest evidence. Do not create another issue.

Use title `CI runtime: WORKFLOW / JOB exceeds the performance budget`. A new issue must include the
canonical marker, sample count, every sampled duration, eligible five-sample median, maximum,
violation reasons (`sample-at-or-above-hard-ceiling` and
`five-sample-median-above-threshold`; older issues may still say
`sample-at-or-above-600-seconds` / `five-sample-median-above-360-seconds`), and links to every
sampled job and workflow run. State that the target is around
eight minutes via fewer, longer-running shards, and ten minutes is a hard performance
ceiling, not a timeout or CI failure threshold. Apply `github_actions`, `workflow`, and `automation`.
Apply `priority: high` when any sample is at least ten minutes; otherwise apply `priority: medium`
for a median-only violation. A comment must include the same current evidence and links.

After creating or commenting, report the representative issue number. Do not modify code, create a
branch, push, or open a PR.
