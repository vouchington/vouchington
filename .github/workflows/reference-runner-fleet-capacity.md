# Runner Fleet Capacity

[Back to Workflow Runners](RUNNERS.md#runner-fleet-capacity)

Self-hosted capacity is live operational state, not a repository constant. Before adding or
widening demand on a self-hosted pool, collect one timestamped live snapshot and attach its
summary to the PR. A snapshot must be no more than 15 minutes old at decision time. Re-collect it
immediately before the final recommendation and again immediately before approval or merge if the
demand-increasing change remains; otherwise it is stale and fails closed. Never substitute a previous
fleet count, average utilization, or an admission failure for this evidence.

## Live-capacity procedure

1. Record the snapshot timestamp, repository, proposed change's exact `runs-on` label set, and
   source URLs. Query the runner API,
   `GET /repos/{owner}/{repo}/actions/runners?per_page=100`, and record `total_count` plus any
   `Link: rel="next"`. A runner is eligible only when its labels are a label-superset of that set
   and verified runner-group/workflow access permits the proposed repository workflow. Do not infer
   group membership or access from labels: if either cannot be established, capacity is unknown and
   fails closed, including for the permanently fenced-off `dependabot` pool. Use GitHub's
   `status: online|offline` and `busy: true|false`: online-idle is
   online/busy=false, online-busy is online/busy=true, and offline is never capacity. A
   `total_count` beyond the inspected page, a next link, or an API error is incomplete inventory.
   The fenced pool never backfills `Tests`, `CPU`, or `Playwright` demand.
2. Make separate bounded Actions-run queries at the same timestamp:
   `GET /repos/{owner}/{repo}/actions/runs?status=requested&per_page=100`,
   `GET /repos/{owner}/{repo}/actions/runs?status=waiting&per_page=100`,
   `GET /repos/{owner}/{repo}/actions/runs?status=pending&per_page=100`,
   `GET /repos/{owner}/{repo}/actions/runs?status=queued&per_page=100`, and
   `GET /repos/{owner}/{repo}/actions/runs?status=in_progress&per_page=100`. Require
   `requested.total_count + waiting.total_count + pending.total_count + queued.total_count + in_progress.total_count <= 100`;
   otherwise queue evidence is incomplete before any jobs inspection. Then query every returned
   run's jobs with
   `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs?per_page=100`. Classify capacity from each
   returned job’s own status, never its parent run: completed or terminal jobs do not compete. An
   `in_progress` or `running` job counts only when its assigned runner belongs to the proposed
   eligible set. A `requested`, `waiting`, `pending`, or `queued` job counts when its
   requested-label-derived eligible set overlaps proposed eligible hosts; unknown status or missing or
   ambiguous assignment, labels, or eligibility fails closed. This catches queued siblings inside an
   `in_progress` run. A broader-label job can consume a scarce subset host. Record every competing
   job and its state. Each eligible `status=online, busy=true` runner must map to exactly one counted
   `in_progress` or `running` job assigned to it. Zero matches, duplicate matches, or state drift fails
   closed; an unreconciled busy runner is never free capacity. Fail closed when either runs response or
   any jobs response has a `total_count` beyond the inspected bound, a `Link: rel="next"`, pagination,
   an unreadable body, or an API error; do not use the default 30-item page as complete evidence.
3. Obtain a current per-host runner-work-filesystem metric for every eligible online host from
   supported telemetry or contemporaneous host `df`; record its source, timestamp, the applicable
   admission/reservation floor, and proposed concurrent disk demand. The protected-host admission
   contract reports `free=<n>GiB required=<m>GiB active_leases=<k>` and derives its floor from the
   host's `VOUCHA_RUNNER_DISK_PROFILE`; do not invent a repository-wide numeric threshold. The
   GitHub runner API does not report disk, and a failed disk-admission check is negative evidence
   only. If any metric cannot prove its applicable floor, capacity is unknown.
4. Calculate the proposed post-change topology peak from every existing workflow job that can
   overlap, fixed matrices, and bounded dynamic selectors, plus the proposed fan-out. Add live
   competing jobs that can overlap it. Deduplicate only a job proven represented in both topology
   and live evidence; otherwise sum it, and fail closed when that identity or overlap is ambiguous.
   A dynamic selector without a documented upper bound is unbounded evidence, not a zero or average.
5. Preserve the 80% policy threshold: if this fail-closed overlap accounting would exceed 80% of
   eligible online capacity, narrow the change, reuse/fan-in existing work, or use an appropriate
   ephemeral runner. Record the calculation and its inputs.

If any runner, queue, disk, topology, fixed-matrix, or dynamic-fan-out evidence is missing, stale,
truncated, unreadable, or unbounded, fail closed. Recommend only demand-neutral or demand-reducing
work; do not recommend a self-hosted capacity increase.

## Snapshot worksheet

| Evidence         | Required recorded value                                                                                                                                                                                                                                         | Incomplete when                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Runner inventory | Runner API URL, `per_page=100`, `total_count`/Link, exact labels, verified runner-group/workflow access, `status`/`busy` totals, and each eligible online-busy runner reconciled to exactly one counted running job                                             | Labels, group membership/access, state, page bound, fenced-pool exclusion, or busy-runner reconciliation cannot be established |
| Queue            | Five separate nonterminal-status URLs, `requested.total_count + waiting.total_count + pending.total_count + queued.total_count + in_progress.total_count <= 100`, every returned run's jobs classified by each job's own status and eligible-runner-set overlap | Any response paginates, exceeds the summed bound, or job status/assignment/labels/eligibility are ambiguous                    |
| Disk             | Current runner-work-filesystem metric source/timestamp, applicable profile floor, and proposed concurrent demand                                                                                                                                                | Any eligible host cannot prove its floor                                                                                       |
| Demand           | Proposed post-change topology peak plus independent live competing jobs; subtract only proven duplicates                                                                                                                                                        | An overlap, identity, selector upper bound, or topology is unknown                                                             |
| Decision         | 15-minute-at-decision snapshot, final/approval refreshes, fail-closed overlap-accounting 80% comparison, and recommendation                                                                                                                                     | Any preceding evidence is incomplete or snapshot is older than 15 minutes                                                      |

Independently of queue time, every CI job targets around 8 minutes of execution via fewer,
longer-running shards, while 10 minutes is a hard performance ceiling. The scheduled
[`ci-job-runtime.md`](../../docs/prompts/scheduled/ci-job-runtime.md) audit opens or updates issues
for breaches; the budget does not impose a job timeout or turn an otherwise successful job red.

Cost model: self-hosted `Tests`/`CPU`/`Playwright` runners preserve local caches but consume scarce
fixed capacity. Ubicloud offered ephemeral, per-minute-billed runners as queue relief, used only
after confirming environment fit because it traded against cold-start, cache, and direct-runtime
cost; Ubicloud was cancelled 2026-09-19, and ephemeral CI now runs on GitHub-hosted runners instead.
