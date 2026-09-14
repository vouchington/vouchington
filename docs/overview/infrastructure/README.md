# Infrastructure

AWS resources, networking, and deployment for Voucha.

## Documents

| File                                                | Description                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Infrastructure](./infrastructure.md)               | AWS resources and the boundary between Filaments and `vouchington-infra`              |
| [Networking](./networking.md)                       | VPC topology, public IPv4 cost model, and egress design decisions                     |
| [Deployment](./deployment.md)                       | Platform, immutable artifact handoff, traffic routing, and provisioning checklist     |
| [SOCI Lazy Loading](./soci-lazy-loading.md)         | SOCI v2 index generation for Fargate lazy loading, decision rationale, and operations |
| [S3 Buckets × Lifecycle Matrix](./s3-buckets.md)    | Bucket purposes, encryption, and lifecycle/retention rules                            |
| [Env Var Contract](./env-var-contract.md)           | Filaments-owned typed env-var metadata and private deployment handoff                 |
| [Environment Variables](./environment-variables.md) | Complete inventory of all env vars by category                                        |

## Sync Rule

Filaments owns application code and immutable build artifacts. The private
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository owns OpenTofu,
provider configuration, and provider mutations. Update the relevant documentation in its owning
repository when resource shapes, deployment configuration, or cost data change.
