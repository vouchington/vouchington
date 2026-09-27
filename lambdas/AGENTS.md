# Lambda packages

- Load [event-ingress-routing](../.agents/skills/event-ingress-routing/SKILL.md) before adding/changing AWS→backend bridges; it owns in-VPC Lambda vs public endpoint placement.
- Bridging Lambdas enqueue only, never perform external IO. Use [Lambda package docs](../docs/overview/infrastructure/lambdas/README.md).
