# Principle: SSE / long-lived connection duration under Fargate Spot

[Back to Runtime Timeouts](runtime-timeouts.md)

> Production runs a mixed on-demand/Spot ECS capacity provider strategy, and staging runs 100%
> Spot (`vouchington-infra/opentofu/locals.tf`). AWS Fargate Spot can reclaim a task's compute at any time, sending
> `SIGTERM` with only a short, platform-level interruption notice before the task is killed. This
> is standard AWS Fargate Spot behavior — it is **not** a value configured anywhere in this repo's
> OpenTofu (there is no `stop_timeout` or interruption-notice setting here; do not cite one as if
> there were). It is also a distinct, shorter-notice mechanism from this app's own graceful-shutdown
> force-exit timer (`GRACEFUL_SHUTDOWN_PERIOD_SECONDS`, default 10s — see
> [Graceful Shutdown](../overview/architecture/graceful-shutdown.md)); the two are not the same
> window and should not be conflated.
>
> **Consequence:** no long-lived connection (SSE, WebSocket) this app serves should assume it can
> outlive the pod. Endpoints should cycle on a short, bounded duration, and the client must
> reconnect continuously — via native `EventSource` reconnect, not a one-shot retry — so that a
> Spot interruption drop is **indistinguishable from a routine cycle**. The cap doesn't make
> shutdown faster; it makes disconnection routine, so the reconnect path is always warm. New or
> changed SSE endpoints should default to a short cap (the data-request export stream uses 1
> minute) unless a documented exemption applies.

See [SSE compliance status](reference-runtime-timeouts-sse-compliance-status.md#sse-compliance-status) for each stream's cycle duration and
client recovery behavior.
