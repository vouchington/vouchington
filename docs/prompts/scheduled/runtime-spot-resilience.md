Review runtime Spot resilience. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one SSE or WebSocket route.

Audit the served SSE and WebSocket routes and their web, Swift, and .NET consumers. Verify that:

- every live connection has a server-owned cycle cap of at most 120 seconds;
- clients reconnect or reattach while work remains active;
- clients distinguish terminal `done` or named `error` events from premature EOF;
- work exceeding two minutes has documented idempotency, durable recovery, or an accepted-loss contract; and
- connection caps stay distinct from worker deadlines, queue lock and stalled windows, and external request timeouts.

Do not lower a worker deadline, `lockDuration`, stalled window, or external timeout just to meet the connection target. Confirm capacity-provider claims against the OpenTofu configuration in the private `vouchington-infra` repository, not defaults. Prefer the smallest root-cause fix with a regression test and current docs; if too large, ship one safe guardrail or retry improvement and record the rest in the PR.
