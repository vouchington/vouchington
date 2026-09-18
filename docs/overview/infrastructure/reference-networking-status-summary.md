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
- [API Egress Proxy](../architecture/api-egress-proxy.md) — provider-scoped HTTP CONNECT routing
  from IPv6-only API tasks through the dual-stack CPU worker service
- The VPC definition (`opentofu/vpc.tf` in the private `vouchington-infra` repository) — VPC, subnets, route tables
- The ALB definition (`opentofu/alb.tf` in the private `vouchington-infra` repository) — ALB configuration
- The ECS task definitions (in the private `vouchington-infra` repository) — task definitions and `assign_public_ip`
- The OpenTofu overview (the private `vouchington-infra` repository) — environment model and cost estimates
- [Runtime Timeouts](../../development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot) — the Fargate Spot capacity-provider strategy (`vouchington-infra/opentofu/locals.tf`) grounds the principle that SSE/long-lived connections must degrade within a short, bounded window
