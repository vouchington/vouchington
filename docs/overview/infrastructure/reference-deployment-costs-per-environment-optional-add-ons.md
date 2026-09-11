# Optional deployment add-ons and environment differences

[Back to per-environment AWS costs](reference-deployment-costs-per-environment-aws-costs.md)

## Optional add-ons (currently disabled or deferred)

| Feature            | Variable                    | Est. $/mo   | Notes                                                                      |
| ------------------ | --------------------------- | ----------- | -------------------------------------------------------------------------- |
| NAT gateway        | —                           | ~$33/AZ     | Per-task IPs are cheaper at current scale; see [Networking](networking.md) |
| WAFv2 WebACL       | `enable_waf`                | ~$7–10      | Toggled off by default                                                     |
| Container Insights | `enable_container_insights` | ~$2.50/task | Toggled off by default                                                     |
| Security Hub       | `enable_security_hub`       | ~$1–10      | Toggled off by default                                                     |
| AWS Config         | `enable_config`             | ~$3–10      | Toggled off by default                                                     |

The four toggle variables are in `vouchington-infra/opentofu/variables.tf`, all defaulting to `false`.
NAT gateway provisioning will require adding an `aws_nat_gateway` resource and
corresponding variable when traffic warrants it.

## Staging vs. production differences

Both environments use the same OpenTofu module with the `environment` variable.
Key staging-only additions:

- IAM Identity Center developer access (`vouchington-infra/opentofu/iam-developer-access.tf`)
- Dev sandbox S3 bucket (`s3_bedrock_dev_buckets`, staging only, region-pinned to `var.bedrock_region`)
- web and api run Spot-only instead of keeping the on-demand baseline production uses (workers are
  Spot-only in both environments)
- CloudWatch log retention is overridden to 7 days for all staging log groups,
  including ECS, Lambda, WAF, and Firehose
- Aurora `db_min_acu=0` on staging to enable auto-pause between deploys (see the
  [steady-state cost note](reference-deployment-costs-per-environment-steady-state.md) on why this
  doesn't fully pay off in practice); production already keeps a `db_min_acu=1` floor
  (`production.tfvars.example`)
- GuardDuty is disabled on staging (`enable_guardduty=false` in `staging.tfvars`)
  and enabled on production (`production.tfvars.example`)

Production tfvars are passed at apply-time (no committed `production.tfvars`).
