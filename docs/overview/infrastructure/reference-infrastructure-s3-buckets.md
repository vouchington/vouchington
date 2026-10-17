# Infrastructure reference

[Back to Infrastructure](infrastructure.md)

## Storage and email

- Buckets are provisioned per environment by `vouchington-infra` for uploaded and rendered images, crawl snapshots, sitemaps (private, read through CloudFront), user data exports, embedding batch input and output, inbound copyright mail and analytics delivery failures. Lifecycle, encryption and retention are infrastructure concerns; read the OpenTofu stack.
- Analytics events can land in S3 Tables through Firehose, one stream per analytics table.
- SES is used for transactional email only. The shared domain identity and authentication records live in the global stack, and environment stacks own configuration sets and bounce and complaint routing (SNS to SQS to a backend worker; see [event-ingress.md](../architecture/event-ingress.md)).
- Inbound mail is stored raw in a private bucket and processed by the application only after both independently deployed consumers are ready; the apex MX stays with the corporate mail provider.
- Secrets live in SSM Parameter Store as SecureStrings referenced by ECS task definitions.

## Networking

- Public and private subnets span multiple availability zones.
- The ALB routes by host header for the environment's public domain.
- ECS Service Connect sidecars carry web-to-backend internal traffic.
- Per-task public IPv4 is used instead of a NAT gateway; see [Networking](networking.md).

## Developer access

Human AWS developer access is managed with IAM Identity Center in the staging infrastructure stack. Individual users and memberships are not stored in application source.

## Related

- [Deployment](deployment.md) for CI/CD flow, images, traffic routing and provisioning.
- [Backend rules](../../../backend/AGENTS.md) and [Web rules](../../../web/AGENTS.md)
