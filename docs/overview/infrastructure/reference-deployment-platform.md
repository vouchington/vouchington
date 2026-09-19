# Deployment reference

[Back to Deployment](deployment.md)

## Platform

AWS (ECS Fargate, arm64 Docker images). The private
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository owns OpenTofu,
artifact publication, and deployment orchestration. See [infrastructure.md](infrastructure.md) for
resource details.

## Environments

| Environment | Domain              | Purpose                                                     |
| ----------- | ------------------- | ----------------------------------------------------------- |
| Staging     | `staging.voucha.ai` | Live through the private infrastructure deployment receiver |
| Production  | `voucha.ai`         | Not live; rollout tracked separately                        |

## Source dispatch

Path-scoped Vouchington workflows validate changed source and dispatch the exact source revision to
the private infrastructure receiver. Vouchington does not publish runtime images or deployment
artifacts, manage provider retention, plan or apply OpenTofu, migrate databases, or mutate ECS,
Lambda, Cloudflare, or static-storage deployment state.

The private repository maps source workflows to deployables, builds and publishes their artifacts,
and owns every provider identifier. Vouchington sends only source repository, revision, workflow,
run, and attempt metadata.
