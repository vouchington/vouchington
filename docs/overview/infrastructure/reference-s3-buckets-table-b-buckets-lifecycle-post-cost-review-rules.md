# S3 Buckets × Lifecycle Matrix reference

[Back to S3 Buckets × Lifecycle Matrix](s3-buckets.md)

## Table B — Buckets × lifecycle (post cost-review rules)

| Key                                                     | Env                  | Transition                             | Expiration                        | Noncurrent expiry     | Abort MPU | Delete markers |
| ------------------------------------------------------- | -------------------- | -------------------------------------- | --------------------------------- | --------------------- | --------- | -------------- |
| `images`                                                | production           | INTELLIGENT_TIERING @0d                | — (app-managed deletion)          | —                     | 7d        | —              |
| `image_uploads`                                         | all                  | —                                      | 2d                                | —                     | 2d        | —              |
| `coverage_transport`                                    | all                  | —                                      | 1d                                | —                     | 1d        | —              |
| `images`                                                | staging              | —                                      | 30d                               | —                     | 7d        | —              |
| `image_renders`                                         | all                  | —                                      | 30d                               | 30d                   | 7d        | —              |
| `artifacts`                                             | production           | INTELLIGENT_TIERING @0d (log prefixes) | 365d (log prefixes)               | 30d                   | 7d (logs) | cleaned        |
| `artifacts`                                             | staging              | —                                      | 30d (log prefixes)                | 30d                   | 7d (logs) | cleaned        |
| `assets`                                                | production           | INTELLIGENT_TIERING @0d                | — (durable content)               | —                     | 7d        | —              |
| `assets`                                                | staging              | —                                      | 30d                               | —                     | 7d        | —              |
| `analytics_firehose_errors`                             | all                  | —                                      | 30d                               | —                     | 7d        | —              |
| `crawls`                                                | all                  | —                                      | 7d                                | —                     | 7d        | —              |
| `sitemaps`                                              | all                  | —                                      | — (overwritten in place)          | —                     | 7d        | —              |
| `user_exports`                                          | all                  | —                                      | 7d                                | 7d                    | 2d        | cleaned        |
| `ses_inbound`                                           | all                  | —                                      | `incoming/`: none; `failed/`: 30d | —                     | 7d        | —              |
| `logs`                                                  | all                  | —                                      | 30d                               | —                     | 7d        | —              |
| test buckets                                            | all                  | —                                      | 7d                                | —                     | 1d        | —              |
| dev buckets (currently unused; 0 buckets — see table A) | all                  | —                                      | 7d                                | —                     | 1d        | —              |
| `bedrock_batch`                                         | staging + production | —                                      | 14d                               | —                     | 1d        | —              |
| `bedrock_batch` (dev)                                   | staging only         | —                                      | 7d                                | —                     | 1d        | —              |
| state                                                   | all                  | —                                      | —                                 | 90d (noncurrent only) | —         | —              |

Legend: `—` = no rule / intentionally omitted. `@0d` = transition effective immediately (from object creation).

---

## Known Gaps

- **Production `images` deletion is app-managed**: the lifecycle rule tiers objects to INTELLIGENT_TIERING but does not expire them. Orphaned images (whose DB references were deleted) rely on the application's delete path (`S3Buckets.images` delete call). A full audit of orphan risk is out of scope here.
- **Cost Allocation Tag activation is manual**: the `Component`, `Purpose`, and `Environment` tags will not appear in AWS Cost Explorer until they are activated as Cost Allocation Tags in the AWS Billing Console → Cost Allocation Tags. OpenTofu cannot do this — it must be done once per account after the first apply. See `vouchington-infra/opentofu/HUMAN_CHECKLIST.md` for the post-apply step.
- **`artifacts` lifecycle does not cover all prefixes**: the new prefix-scoped rules cover `alb-logs/`, `cloudtrail/`, and `config/`. Any objects written under other key prefixes are not covered by an expiry rule.
