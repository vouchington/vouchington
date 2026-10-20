# Runtime Timeouts

Why runtime timeouts are what they are. The values live in code; this page records the
constraints a change must respect.

## Principle: SSE / long-lived connection duration under Fargate Spot

Production runs a mixed on-demand/Spot ECS capacity provider strategy and staging runs all Spot.
Fargate Spot can reclaim compute at any time with only a short platform-level notice. That notice
is distinct from the app's own graceful-shutdown force-exit timer (see
[Graceful Shutdown](../overview/architecture/graceful-shutdown.md)); do not conflate them.

No long-lived connection (SSE, WebSocket) may assume it outlives the pod. Endpoints cycle on a
short bounded duration and clients reconnect continuously through native `EventSource` reconnect,
so a Spot drop is indistinguishable from a routine cycle. The cap does not speed up shutdown; it
keeps the reconnect path warm. New SSE endpoints default to a short cap unless a documented
exemption applies. Routine cycle expiry emits no named error event, so native retry treats it
like any dropped connection. API routes cycle through `startSSE`.

The GlideMQ dashboard event stream is an Express route in the API process, so the entrypoint ends
that response on the same cycle and still writes no named error event. The dashboard page
reconnects. Queue rows stay in the queue; event lines that existed only on the dropped connection
are an accepted loss. The package's job-output SSE route already ends after a bounded stream read,
so it is not a keep-open Spot connection.

Production WebSocket upgrades are rejected. The only proxied WebSocket is local Next.js HMR, and
it stays disabled outside local development, so it is not a Spot connection.

`server.timeout` (legacy socket inactivity) stays disabled on the API server: a positive value
would cut sparse-write SSE streams mid-flight.

## Crash-recovery windows are not runtime caps

`glide-mq` `lockDuration` bounds how long a job may go without a heartbeat before another worker
picks it up after a crash. Shortening it only makes a slow-but-alive job get duplicated sooner.
Size it from heartbeat and crash-recovery behavior, never from the SSE connection lifetime.

Each lapsed lock increments the job's `stalledCount`, which never resets and is independent of
`attempts`. A deploy that force-exits the process mid-job counts as a stall, so the budget absorbs
one deploy plus one slow heartbeat (see
[Worker construction](../overview/architecture/backend/README.md)).
Raising a worker's `maxStalledCount` hides a job that keeps crashing; fix the job or its
`lockDuration` instead.

## External calls

Timeouts on external fetches are sized to the peer's real latency: lowering risks spurious
failures against a slow-but-healthy peer, raising risks a hung call holding a worker slot.

- Crawler phase budgets (DNS/SSRF resolution, request to headers, body download) are independent
  and re-armed per redirect hop; only the total crawl deadline is absolute.
- A DNS timeout bounds only the caller's wait. The underlying lookup can keep holding a libuv
  threadpool slot, so black-holed DNS can still exhaust the pool.
- Each phase budget must be threaded into the body read; otherwise the call silently falls back to
  the dispatcher's default `bodyTimeout`, which is deliberately long so sparse LLM streams are not
  aborted mid-response.
- Use the routine dispatcher policy unless the protocol can legitimately delay response headers
  beyond the routine policy (AI generation).
- The SQS client's socket timeout must stay above the protocol long poll.
