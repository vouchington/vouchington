# Infrastructure reference

[Back to Infrastructure](infrastructure.md)

## S3 Buckets

Analytics events can also land in S3 Tables through Kinesis Data Firehose. The environment OpenTofu stack provisions one Firehose stream per analytics table, a shared `analytics` S3 Tables namespace, and a short-lived encrypted S3 bucket for failed Firehose delivery payloads. The account-level `s3tablescatalog` Glue federated catalog lives in `vouchington-infra/opentofu/global` so staging and production do not compete for the same AWS catalog; each Firehose stream uses its environment table-bucket child catalog. Firehose receives Lake Formation `DESCRIBE` database and table-wide permissions on that catalog, plus `lakeformation:GetDataAccess` on its delivery role, so AWS can authorize the S3 Tables Glue lookup before writing records. The backend and worker ECS task roles can only call `PutRecord`/`PutRecordBatch` on those analytics streams.

Application bucket types × environment:

| Bucket                      | Purpose                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `images`                    | User-uploaded source images                                         |
| `image-renders`             | Resized/rendered image cache                                        |
| `artifacts`                 | Operational logs (ALB, CloudTrail, Config)                          |
| `bedrock_batch`             | Bedrock embedding batch I/O (region-pinned to `var.bedrock_region`) |
| `assets`                    | Article/long-form content assets                                    |
| `analytics-firehose-errors` | Firehose failed-delivery diagnostics                                |
| `crawls`                    | HTML/RSS crawl snapshots                                            |
| `sitemaps`                  | XML sitemaps for search engines (private S3, read via CloudFront)   |
| `user-exports`              | User data exports (GDPR); 7-day download TTL                        |
| `ses-inbound`               | Durable raw support email pending worker processing                 |

For full lifecycle, encryption, and retention details see [S3 Buckets × Lifecycle Matrix](s3-buckets.md).

## SES (Email)

- Shared `voucha.ai` domain identity, DKIM, SPF, DMARC, CAA, fixed-name GitHub OIDC roles, ECR repositories, and the SOCI builder stack live in `vouchington-infra/opentofu/global`
- Environment stacks own SES configuration sets and bounce/complaint routing
- Used for transactional email only (login OTP, notifications)
- Bounce handling: SNS → SQS → backend worker consumer (see [event-ingress.md](../architecture/event-ingress.md))
- Inbound support mail: Google Workspace routes `support@voucha.ai` to the SES-only `support@inbound.voucha.ai` address; SES stores raw MIME under private S3 `incoming/`, S3 delivers the event via SQS to a worker consumer, which enqueues only the object pointer to GlideMQ (`vouchington-infra/opentofu/sqs-event-ingress.tf`, `backend/workers/ses-inbound-sqs`). The backend worker owns MIME parsing and database writes. Successful objects are deleted; terminal failures move to `failed/` for 30 days.
- `enable_ses_inbound` defaults false and activates the production-only receipt rule set, S3 notification, and inbound-subdomain MX only after both independently deployed consumers are ready. The apex MX remains Google Workspace.
- Starts in sandbox mode — production access must be requested separately

## Networking

- **VPC**: 2 public + 2 private subnets across 2 AZs
- **Public IPv4**: ~$3.60/mo per ECS task + ~$7/mo ALB (separate billing line from ALB base hours)
  ≈ $18/mo/env for the default three-task topology;
  per-task is cheaper than a NAT gateway at current scale — see [Networking](networking.md)
- **ALB**: Host-based routing for the environment public domain (`staging.voucha.ai` / `voucha.ai`)
- **Service Connect**: ECS Envoy sidecars for web → backend internal traffic; web resolves `http://backend:2900` inside the VPC; the ALB still hits the backend app directly on port 2900 via `ingress_port_override`
- **CloudWatch**: Log groups (7-day retention for all staging groups, including ECS, Lambda, WAF, and Firehose; 14-day default elsewhere), alarms (ALB 5xx, unhealthy targets, ECS task count)
- **SSM Parameter Store**: All secrets stored here (SecureString), referenced by ECS task definitions via `valueFrom`

## Developer Access

Human AWS developer access is managed with IAM Identity Center in the staging `vouchington-infra`
stack. The private operator guide owns exact group names, permission-set identifiers, account
assignments, and membership steps. Production does not create these shared developer-access
resources, and individual users or memberships are not stored in application source.

## Cost Estimates

Cost and unit-economics documentation — the pre-launch baseline and current steady-state AWS
estimates, CI/testing costs, and cross-environment SaaS costs — lives in the private
`vouchington/vouchington-docs` repository. This page keeps the resource architecture details
only; update cost rows there so the checked totals stay in one place.

## Related

- [Deployment](deployment.md) — CI/CD flow, Docker images, traffic routing, provisioning checklist
- [Backend rules](../../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../../web/CLAUDE.md) — UI and routing conventions

- [docs/overview/architecture/ai-agents.md](../architecture/ai-agents.md)
- [docs/overview/architecture/auth-overview.md](../architecture/auth-overview.md)
- OpenTofu (the private `vouchington-infra` repository)
- Developer access (`opentofu/DEVELOPER_ACCESS.md` in the private `vouchington-infra` repository)
- The global stack (`opentofu/global` in the private `vouchington-infra` repository)
