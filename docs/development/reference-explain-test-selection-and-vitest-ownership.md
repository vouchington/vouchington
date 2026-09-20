# Explain Test Selection and Vitest Ownership

[Back to Vitest Projects](reference-tests-vitest-projects.md#explain-test-selection-and-vitest-ownership)

Use the planner before choosing tests by filename or directory. Its JSON output records each
selected test's dependency path and executable target; use `why` to inspect one path and `targets`
to resolve a test file to its exact Vitest config and project. Batch all changed sources for the
same framework/environment across the whole repository; do not run the planner once per workspace
or source file. Save the completed batch before using single-file diagnostics:

```bash
pnpm exec no-mistakes tests plan vitest --changed-file backend/api/v1/admin/article-syncs.mts --changed-file backend/queues/article-sync/enqueues.mts --format json > plan.json
pnpm exec no-mistakes tests why backend/api/v1/admin/article-syncs.test.mts --plan plan.json --format json
pnpm exec no-mistakes tests targets vitest backend/api/v1/admin/article-syncs.test.mts --format commands
```

CI invokes no-mistakes only for the static-analysis full check and the centralized Vitest and
Playwright selectors. Those production invocations disable execution and machine-wide lock-wait
deadlines so they serialize on no-mistakes' shared lock; existing job timeouts remain global safety
backstops.
The two tooling tests that execute the real Vitest and Playwright planner are skipped when
`CI=true` to avoid competing for that lock, while mocked adapter, configuration, and source
assertions continue to run. Run those two integration cases locally with their bounded Vitest
harness when changing planner behavior.

When the plan produces many exact web test paths, preserve that selection with the
[large exact-file manifest recipe](reference-project-name-reference.md#large-exact-file-manifests) instead of turning the paths into a
glob or an unquoted string.

For this example, `targets` resolves the test to `vitest.config.mts` project
`backend-data-stores`. Interpret the plan as follows:

- `groups[].type: "direct"` contains test files that were themselves changed. A source-only plan
  does not put its colocated test in this group; append directly modified tests to the run as shown
  in the [before-push commands](../../.agents/skills/agent-workflow/before-pushing.md).
- A two-node reason whose `via` is `["test"]` is the paired source-to-test relationship. Here it
  connects `article-syncs.mts` directly to `article-syncs.test.mts`.
- Longer reasons containing `dependency` steps are broader graph dependents. Inspect them with
  `tests why` before treating a distant test as the source's primary contract.
- "Same-package contract" is a Vouchington review heuristic, not a planner group: find the changed
  source's nearest owning `package.json`, then prefer relevant returned tests under that package
  boundary. Do not discard cross-package results when their reported dependency path describes a
  real public contract.

For cross-language parity, package-legality, and queue-impact fallbacks, follow the local
[impact-map recipes](../../.agents/skills/agent-workflow/impact-recipes.md).
