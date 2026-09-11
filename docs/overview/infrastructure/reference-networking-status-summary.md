# Networking reference

[Back to Networking](networking.md)

## Status Summary

| Item                                 | Status                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-task public IPv4                 | Active — `worker-cpu` only, ~$4/mo/env; worker-io incurs it only when private infrastructure re-enables that task; `web`/`api` moved to IPv6-only                                                                                                        |
| ALB `dualstack-without-public-ipv4`  | Configured — public IPv6 frontend; `backend`/`web` target groups are `ipv6`                                                                                                                                                                              |
| SSM Parameter Store VPC endpoint     | Configured — dual-stack interface endpoint, used by ECS Fargate tasks                                                                                                                                                                                    |
| IPv6-only ECS tasks                  | Configured — `web`/`api` run in dedicated IPv6-only subnets; staging verification gate is the remaining proof (see [AWS Application Endpoint Inventory](reference-networking-aws-application-endpoint-inventory.md#ipv6-only-staging-verification-gate)) |
| Issue #2942 (dual-stack ALB ingress) | Closed — IPv6 SG rules already present (`vouchington-infra/opentofu/security-groups.tf:65,76`); marginal behind Cloudflare                                                                                                                               |

## Related

- [Endpoint Migration recipe](../../../.agents/skills/agent-workflow/impact-recipes.md#endpoint-migration) —
  discovery and compatibility evidence required before changing a URL, hostname, or origin
- [Security](../../requirements/security/SECURITY.md) — browser CSP origins for direct dual-stack S3 uploads
- [Infrastructure](infrastructure.md) — ECS sizing, Aurora/Valkey, CloudFront, S3
- [Deployment Costs](deployment-costs.md) — Full cost breakdown per environment
- [API Egress Proxy](../architecture/api-egress-proxy.md) — provider-scoped HTTP CONNECT routing
  from IPv6-only API tasks through the dual-stack CPU worker service
- [`vouchington-infra` VPC](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/vpc.tf) — VPC, subnets, route tables
- [`vouchington-infra` ALB](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/alb.tf) — ALB configuration
- [`vouchington-infra` ECS definitions](https://github.com/vouchington/vouchington-infra/tree/main/opentofu) — task definitions and `assign_public_ip`
- [`vouchington-infra` OpenTofu overview](https://github.com/vouchington/vouchington-infra/tree/main/opentofu) — environment model and cost estimates
- [Voucha — Product Overview (investor deck, Google Drive)](https://docs.google.com/document/d/1xfS0uGxV66sDyUvZk20TyVDvz43V5ZJXR5W5DKgEyvI/edit) — Cost narrative
  (note: reflects pre-split service count; cost estimates will drift as the stack scales)
- [Runtime Timeouts](../../development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot) — the Fargate Spot capacity-provider strategy (`vouchington-infra/opentofu/locals.tf`) grounds the principle that SSE/long-lived connections must degrade within a short, bounded window
