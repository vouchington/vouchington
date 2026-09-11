# Pre-launch baseline deployment costs

[Back to per-environment AWS costs](reference-deployment-costs-per-environment-aws-costs.md)

Kept for historical comparison: this was the resource set and cost before the
compute/data plane was provisioned (see the banner above). It is no longer the
active configuration — see [steady-state full-stack costs](reference-deployment-costs-per-environment-steady-state.md)
for today's costs.

| Service                            | Notes                                        | Est. $/mo/env                         |
| ---------------------------------- | -------------------------------------------- | ------------------------------------- |
| Lambda (image-resize + ses-bounce) | arm64, 512 MB, reserved concurrency 20       | ~$1                                   |
| CloudFront (3 distributions)       | PriceClass_100 (US/CA/EU); ~$0 at low egress | ~$1                                   |
| S3 (~10 app buckets + CI buckets)  | lifecycle-managed; low storage at launch     | ~$1                                   |
| Kinesis Firehose → S3 Tables       | per-GB ingestion + storage/compaction        | usage-metered                         |
| SES (transactional email)          | $0.10/1k emails; starts in sandbox           | ~$1                                   |
| GuardDuty                          | disabled on staging; enabled on production   | ~$0 staging / ~$3–10 production       |
| CloudWatch (log groups, alarms)    | 14-day retention; 7 log groups, 7 alarms     | ~$2                                   |
| KMS (2 CMKs)                       | $1/CMK/mo + API calls                        | ~$2                                   |
| Secrets Manager + SSM              | per-secret/month fee                         | ~$2                                   |
| **Total (pre-launch baseline)**    |                                              | **~$10 staging / ~$13–20 production** |

At the time, NAT gateway, ALB, ECS, Aurora, Valkey, and monitoring were all off →
no charges for those lines. All of these are now provisioned and billed — see
[steady-state full-stack costs](reference-deployment-costs-per-environment-steady-state.md).
