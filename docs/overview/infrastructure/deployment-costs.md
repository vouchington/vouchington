# Deployment Costs

Monthly cost estimates across staging, production, and CI/testing. Figures are
derived from OpenTofu resource configuration and known list prices at low-to-zero
traffic — usage-metered lines (CloudFront egress, Firehose GB, Bedrock tokens,
Sentry events, LLM API calls) scale with actual traffic and are marked as such.

> **Current state:** The compute/data plane (ALB, ECS, Aurora, Valkey, monitoring) is
> now provisioned — all `.tf.disabled` files were renamed to `.tf` and the stack was
> applied. The steady-state ~$100–130 staging / higher production cost model below
> is now active (revised from the original ~$75–95/env estimate — see the
> Aurora and GuardDuty notes in the steady-state table; the original figure
> assumed Aurora was ~$0 while idle, which June 2026 billing showed is not the
> case for a constantly-deployed staging environment).

## Contents

- <a id="per-environment-aws-costs"></a>[Per-Environment AWS Costs](reference-deployment-costs-per-environment-aws-costs.md)
- <a id="ci--testing-costs"></a>[CI / Testing Costs](reference-deployment-costs-ci-testing-costs.md)
- <a id="cross-environment-saas"></a>[Cross-Environment SaaS](reference-deployment-costs-cross-environment-saas.md)
- <a id="cost-controls-already-in-place"></a>[Cost Controls Already in Place](reference-deployment-costs-cost-controls-already-in-place.md)
- <a id="assumptions--caveats"></a>[Assumptions & Caveats](reference-deployment-costs-cost-controls-already-in-place.md)
- <a id="related"></a>[Related](reference-deployment-costs-cost-controls-already-in-place.md)
