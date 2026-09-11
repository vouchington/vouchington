Review runtime Spot resilience. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

Audit the served SSE and WebSocket routes and their web, Swift, and .NET consumers. Verify that:

- every live connection has a server-owned cycle cap of at most 120 seconds;
- clients continuously reconnect or explicitly reattach when work remains active;
- clients distinguish terminal `done` or named `error` events from premature EOF;
- work that can exceed two minutes has documented idempotency, durable recovery, or an explicit accepted-loss contract; and
- connection caps remain distinct from worker deadlines, queue lock and stalled windows, and external request timeouts.

Do not lower a worker deadline, queue `lockDuration`, stalled window, or external-operation timeout merely to meet the two-minute connection target. Confirm capacity-provider claims against the current OpenTofu configuration in the private `vouchington-infra` repository. Do not infer ECS stop timing or Spot behavior from defaults that are not encoded in the repository.

Prefer the smallest root-cause fix with a regression test and current documentation. If the full finding is too large, ship one independently safe guardrail or retry improvement and record the remaining evidence in the draft PR.
