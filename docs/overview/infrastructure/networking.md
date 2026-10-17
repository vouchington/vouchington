# Networking

Tasks run in public subnets with a public IPv4 each instead of behind a managed NAT gateway, because the NAT gateway's fixed cost is not justified at current scale; the ALB is the only ingress. End-user traffic terminates at Cloudflare's edge, and the origin is reachable over IPv6 where supported. Revisit the per-task IP choice if egress allow-listing or task count changes the math.

## Related

[Endpoint Migration recipe](../../../.agents/skills/agent-workflow/impact-recipes.md#endpoint-migration) covers discovery and compatibility evidence required before changing a URL, hostname, or origin.
