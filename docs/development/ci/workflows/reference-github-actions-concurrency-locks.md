# GitHub Actions Concurrency Locks

Workflow YAML is the executable concurrency contract. The typed policy in
[`concurrency-topology-policy.mts`](../../../../.github/workflows/concurrency-topology-policy.mts) records pending behavior,
cancellation behavior, and resource scope. The topology tests keep every live workflow, job,
reusable caller, and lock synchronized.

Fix Dependabot's lock uses the Dependabot branch and source workflow ID, so a Web completion cannot
replace a pending Backend failure on the same branch. The active run is retained; only pending
completions from the same source and branch coalesce. See [Standalone Workflow Checks](../../docs/development/reference-ci-standalone-workflow-checks.md#auto-harness-automation-workflows)
for the source-run and PR-head revalidation boundary.

Generate the current topology from YAML:

```sh
pnpm run ci:topology --format json
pnpm run ci:topology --format mermaid
pnpm run ci:topology --workflow main-backend.yml --format mermaid
```
