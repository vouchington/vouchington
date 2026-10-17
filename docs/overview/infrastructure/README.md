# Infrastructure

AWS resources, networking, and deployment for Voucha.

## Documents

| File                                                | Description                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Infrastructure](./infrastructure.md)               | AWS resources and the boundary between Vouchington and `vouchington-infra`         |
| [Networking](./networking.md)                       | Public-IPv4 versus NAT egress decision                                             |
| [Deployment](./deployment.md)                       | Platform, immutable artifact handoff, traffic routing, and provisioning checklist  |
| [SOCI Lazy Loading](./soci-lazy-loading.md)         | SOCI index generation for Fargate lazy loading, decision rationale, and operations |
| [Env Var Contract](./env-var-contract.md)           | Vouchington-owned typed env-var metadata and private deployment handoff            |
| [Environment Variables](./environment-variables.md) | Where env-var names, sensitivity and surfaces are owned                            |

## Runtime owner indexes

- [Cloudflare Worker](cloudflare-worker/README.md)
- [Lambdas](lambdas/README.md)

## Sync Rule

Vouchington owns application code and immutable build artifacts. The private
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository owns OpenTofu,
provider configuration, and provider mutations. Update the relevant documentation in its owning
repository when resource shapes or deployment configuration change.

## Reference index

- [Deployment reference](reference-deployment-ci-cd-flow.md)
- [Deployment reference](reference-deployment-first-time-provisioning-checklist.md)
- [Deployment reference](reference-deployment-platform.md)
- [Static-asset deployment](reference-deployment-s3-static-assets.md)
- [Infrastructure reference](reference-infrastructure-architecture-overview.md)
- [Infrastructure reference](reference-infrastructure-s3-buckets.md)
