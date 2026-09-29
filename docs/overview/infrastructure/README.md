# Infrastructure

AWS resources, networking, and deployment for Voucha.

## Documents

| File                                                | Description                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Infrastructure](./infrastructure.md)               | AWS resources and the boundary between Vouchington and `vouchington-infra`            |
| [Networking](./networking.md)                       | VPC topology, public IPv4 cost model, and egress design decisions                     |
| [Deployment](./deployment.md)                       | Platform, immutable artifact handoff, traffic routing, and provisioning checklist     |
| [SOCI Lazy Loading](./soci-lazy-loading.md)         | SOCI v2 index generation for Fargate lazy loading, decision rationale, and operations |
| [S3 Buckets × Lifecycle Matrix](./s3-buckets.md)    | Bucket purposes, encryption, and lifecycle/retention rules                            |
| [Env Var Contract](./env-var-contract.md)           | Vouchington-owned typed env-var metadata and private deployment handoff               |
| [Environment Variables](./environment-variables.md) | Complete inventory of all env vars by category                                        |

## Runtime owner indexes

- [Cloudflare Worker](cloudflare-worker/README.md)
- [Lambdas](lambdas/README.md)

## Sync Rule

Vouchington owns application code and immutable build artifacts. The private
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository owns OpenTofu,
provider configuration, and provider mutations. Update the relevant documentation in its owning
repository when resource shapes, deployment configuration, or cost data change.

## Reference index

- [Deployment reference](reference-deployment-ci-cd-flow.md)
- [Deployment reference](reference-deployment-first-time-provisioning-checklist.md)
- [Deployment reference](reference-deployment-platform.md)
- [Static-asset deployment](reference-deployment-s3-static-assets.md)
- [Environment Variables reference](reference-environment-variables-ai-ml.md)
- [Environment Variables reference](reference-environment-variables-analytics-pipeline.md)
- [Environment Variables reference](reference-environment-variables-authentication.md)
- [Environment Variables reference](reference-environment-variables-aws-s3-storage.md)
- [Environment Variables reference](reference-environment-variables-bluesky-at-protocol.md)
- [Environment Variables reference](reference-environment-variables-bot-protection-recaptcha-enterprise.md)
- [Environment Variables reference](reference-environment-variables-bot-protection-turnstile.md)
- [Environment Variables reference](reference-environment-variables-browser-crawl-lightpanda.md)
- [Environment Variables reference](reference-environment-variables-cloudflare-worker.md)
- [Environment Variables reference](reference-environment-variables-email-ses.md)
- [Environment Variables reference](reference-environment-variables-feature-flags.md)
- [Environment Variables reference](reference-environment-variables-monitoring.md)
- [Environment Variables reference](reference-environment-variables-native-app-attestation.md)
- [Environment Variables reference](reference-environment-variables-oauth-providers.md)
- [Environment Variables reference](reference-environment-variables-payments-apple-app-store.md)
- [Environment Variables reference](reference-environment-variables-payments-stripe.md)
- [Environment Variables reference](reference-environment-variables-push-notifications.md)
- [Environment Variables reference](reference-environment-variables-server-configuration.md)
- [Environment Variables reference](reference-environment-variables-sideload-image-security.md)
- [Environment Variables reference](reference-environment-variables-typed-contract-coverage.md)
- [Infrastructure reference](reference-infrastructure-architecture-overview.md)
- [Infrastructure reference](reference-infrastructure-s3-buckets.md)
- [Networking reference](reference-networking-aws-application-endpoint-inventory.md)
- [Networking reference](reference-networking-decision-per-task-ip-vs-managed-nat-gateway.md)
- [Networking reference](reference-networking-production-server-external-api-inventory.md)
- [Networking reference](reference-networking-status-summary.md)
- [S3 Buckets × Lifecycle Matrix reference](reference-s3-buckets-table-a-buckets-purpose-configuration.md)
- [S3 Buckets × Lifecycle Matrix reference](reference-s3-buckets-table-b-buckets-lifecycle-post-cost-review-rules.md)
