# AWS CodeBuild Service Quotas And Concurrency

[Back to Workflow Runners](RUNNERS.md#aws-codebuild-service-quotas-and-concurrency)

Filaments uses the private infrastructure repository's `voucha-ci-runner` CodeBuild project only
as an opt-in escape hatch for pull-request image validation.

| Compute type | Filaments consumer               |
| ------------ | -------------------------------- |
| ARM / Large  | `build-web.yml` escape hatch     |
| ARM / XLarge | `build-backend.yml` escape hatch |

AWS applies concurrent-build quotas per account, region, and compute type. Operators must verify
live quotas in the AWS Service Quotas console. Repository source cannot prove those values.

`build-backend.yml` and `build-web.yml` use Ubicloud by default. CodeBuild is selected only when
`vars.CI_IMAGE_BUILDS_ON_CODEBUILD == 'true'` or a pull request has the `codebuild:images` label.
These workflows validate images and do not publish runtime artifacts.

## GitHub Actions concurrency locks

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
