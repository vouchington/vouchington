# Steady-state deployment costs

[Back to per-environment AWS costs](reference-deployment-costs-per-environment-aws-costs.md)

## Full stack enabled (active)

| Service                                                 | Config source                                                                                         | Est. $/mo/env                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ECS Fargate (3 services)                                | staging Spot-only; production web+api on-demand baseline, workers Spot-only                           | ~$15–30 staging / ~$30–50 production                                   |
| Aurora Serverless v2 (0–2 staging / 1–8 production ACU) | staging `db_min_acu=0, db_max_acu=2`; production `db_min_acu=1, db_max_acu=8` (default)               | ~$28–34 staging² / higher, non-paused production (unverified)          |
| ElastiCache Valkey (`cache.t4g.micro`)                  | single node; no multi-AZ                                                                              | ~$12                                                                   |
| ALB                                                     | 1 load balancer + listeners                                                                           | ~$16                                                                   |
| Public IPv4 (ECS tasks)¹                                | 1 task IP (`worker-cpu` only); `backend`/`web` are IPv6-only; see [Networking]                        | ~$4                                                                    |
| SSM interface VPC endpoint                              | two private AZs, dual-stack; used by ECS Fargate tasks                                                | ~$14–16 plus data processing                                           |
| S3 + CloudFront                                         | request-driven (PUT/API ops), not storage — see note³                                                 | ~$5–10                                                                 |
| Amazon Bedrock (Nova embeddings, batch)                 | usage-metered, us-east-1                                                                              | usage-metered — embeddings-only; declining post-launch-backfill        |
| SES                                                     | [Shared identity and per-environment configuration](reference-infrastructure-s3-buckets.md#ses-email) | ~$1                                                                    |
| Lambda (image-resize)                                   | arm64                                                                                                 | ~$1                                                                    |
| CloudWatch                                              | 7-day staging logs; 14-day default elsewhere                                                          | <$5 staging / ~$5 production                                           |
| KMS (2 CMKs) + Secrets Manager/SSM                      | Current configuration — see note⁵                                                                     | ~$4                                                                    |
| GuardDuty                                               | disabled on staging (`enable_guardduty=false`); enabled on production                                 | ~$0 staging / ~$3–10 production                                        |
| **Total (steady-state)**                                |                                                                                                       | **~$100–133 staging / ~$95–129 production (excl. Aurora — see note⁴)** |

[Networking]: networking.md

¹ The ALB still incurs base hours (~$16), but `dualstack-without-public-ipv4` removes its public
IPv4 address charges. See [Networking](networking.md) for the per-task vs. NAT gateway tradeoff.

² Staging Aurora does **not** stay idle-paused the way the mechanism suggests —
every staging deploy wakes it for migrations and health checks, so despite
averaging ~0.2–0.3 ACU it rarely gets a long enough idle window to matter.
June 2026 billing (a partial ~16-day launch month) showed ~$18 for Aurora,
i.e. a ~$28–34/mo run-rate — the largest steady-state line. This is expected
cost from Voucha's staging deploy cadence, not a keep-alive bug; a possible
future lever is batching/throttling staging auto-deploys, but that's out of
scope for now. Production's `db_min_acu=1` floor never auto-pauses at all, so
its Aurora cost is structurally higher than staging's and hasn't been split
out from the account-wide bill yet — see
[Assumptions & Caveats](reference-deployment-costs-cost-controls-already-in-place.md#assumptions--caveats) on cost-allocation tags.

³ The dominant June 2026 S3 cost was **Tier-1 PUT requests**
(`USW2-Requests-Tier1`), not storage and not the Kinesis Firehose → S3 Tables
analytics pipeline (that bills separately as S3 Tables). Safe crawl snapshot
PUT dedupe now skips unchanged HTML bodies only while the previous snapshot is
still inside the 7-day lifecycle window; expired snapshots are refreshed so
boilerplate extraction never points at lifecycle-deleted objects. The remaining
PUT load is driven by unique or expired page bodies plus other app-level writes
(Bedrock batch I/O, image-resize renders). Re-check the S3 line against August
2026 billing before assuming this is the new steady-state traffic pattern.

⁴ The production total above deliberately excludes Aurora (see note² —
production's `db_min_acu=1` floor never auto-pauses, so its list-price cost
floor is structurally higher than staging's, not a rounding difference).
As of July 2026, production isn't deployed yet — `production.tfvars` is
gitignored, only `production.tfvars.example` exists — so there is no billed
figure to sum in, and inventing one here would be a guess dressed up as data.
This total will be revised to include Aurora once production launches and a
full billing cycle isolates that line (tracked alongside the August 2026
re-verification milestone in #6809).

⁵ Current configuration has exactly two purpose CMKs: [S3 encryption](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/kms.tf)
and [SNS bounce](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/ses.tf). The [S3 bucket matrix](reference-s3-buckets-table-a-buckets-purpose-configuration.md#table-a--buckets--purpose--configuration)
defines the S3 CMK coverage; the [Aurora-managed password](reference-environment-variables-typed-contract-coverage.md#core-infrastructure)
and [SSM SecureStrings](reference-infrastructure-s3-buckets.md#networking) are separate managed-secret
paths included in this estimate.
