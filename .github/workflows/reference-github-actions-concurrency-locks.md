# GitHub Actions Concurrency Locks

[Back to Workflow Runners](RUNNERS.md#github-actions-concurrency-locks)

Workflow YAML is the executable concurrency contract. The typed policy in
[`concurrency-topology-policy.mts`](concurrency-topology-policy.mts) records pending behavior,
cancellation behavior, and resource scope. The topology tests keep every live workflow, job,
reusable caller, and lock synchronized.

Generate the current topology from YAML:

```sh
pnpm run ci:topology --format json
pnpm run ci:topology --format mermaid
pnpm run ci:topology --workflow main-backend.yml --format mermaid
```
