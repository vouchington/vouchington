# Networking reference

[Back to Networking](networking.md)

## Decision: Per-Task IP vs. Managed NAT Gateway

This decision now applies to the current `worker-cpu` task and the retained worker-io recovery
path — `web` and `api` sidestepped the
NAT-vs-per-task tradeoff entirely by moving to IPv6-only subnets, since Aurora/Valkey are
dual-stack and every other dependency (ECR, SSM, Secrets Manager, external APIs) is reachable over
IPv6 or the provider-scoped HTTP CONNECT proxy.

| Option                                   | Cost                              | Status                                                  |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Per-task public IPv4 (current)           | ~$3.60/mo per worker task         | **Active for worker-cpu; worker-io only if re-enabled** |
| Managed NAT gateway                      | ~$33/mo/AZ fixed + $0.045/GB data | Break-even at ~15–20 tasks/AZ                           |
| Self-managed NAT instance (e.g. fck-nat) | ~$3–4/mo flat (t4g.nano EC2)      | Cheaper today; rejected operationally                   |

**Decision: stay with per-task IPs at current scale.** Per-task is the cheapest
_managed/serverless_ option at 1–2 worker tasks. A managed NAT gateway only becomes cheaper at
~15–20 steady-state tasks per AZ.

A self-managed NAT instance (fck-nat) is the raw-cheapest option even at this scale, but it
introduces an EC2 box to patch, monitor, and manage in an otherwise-serverless Fargate
stack — operational overhead that is not justified at this scale. The rejection is
_operational_, not cost-based.

**Revisit triggers:**

- Steady-state task count grows toward ~15–20 → managed NAT gateway becomes cost-competitive
- Self-managed NAT instance becomes worth reconsidering if task count reaches ~8+ and the
  operational overhead can be absorbed
