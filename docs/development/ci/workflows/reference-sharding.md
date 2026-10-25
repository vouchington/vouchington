# Sharding

Shard jobs so every leaf job stays within its runtime budget. These are performance budgets
monitored by the scheduled issue audit, never `timeout-minutes` values or CI failure thresholds.
The repo favors fewer, longer-running shards over many short ones: build and startup overhead is
fixed per shard, so splitting further buys little wall-clock time while burning more runner
capacity.

The prep job resolves the shard count from the live checked-out suite, and a missing or nonpositive
count fails the prep job instead of falling back to a stale number. A repository variable that
overrides the registry's files-per-shard value silently re-shards CI, so leave it unset.

The full-stack integration suite is matrix-capable so it can be split later without redesigning the
report and artifact contracts, but its build and setup dominate its runtime, so file-count fan-out
would only duplicate that work.

Playwright shards are sized from the runnable spec count with a per-spec time heuristic, not a
per-spec SLA. The step runs the suite through the published `vouchington-tooling` bounded runner
because `timeout-minutes` did not reap a hung Playwright process group, so a hung shard ran until
the job cap and GitHub dropped the log. The bounded runner kills the group and lets the step exit,
which keeps the failure log and failure artifacts.

No shard owns a singleton duty: pages-router, dependency, typecheck, build, and smoke checks live in
static jobs, and backend port allocation and smoke run in their own workflow.
