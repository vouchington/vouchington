# Related

[Back to Runtime Timeouts](runtime-timeouts.md#related)

- [Graceful Shutdown](../overview/architecture/graceful-shutdown.md) — the app's own force-exit
  timer (`GRACEFUL_SHUTDOWN_PERIOD_SECONDS`, default 10s); distinct from the Fargate Spot
  interruption-notice window this doc's principle is grounded in.
- [Worker Performance](worker-performance.md) — worker sizing/concurrency; this doc covers worker
  _timeouts_ (deadlines, `lockDuration`), that doc covers worker _throughput_.
- [Crawling Architecture](../overview/architecture/crawling.md) — its
  [hard-constraint crawler/RSS fetch timeouts](reference-runtime-timeouts-classification.md#hard-constraints-externalprotocol-driven)
  belong to the crawling pipeline.
- [Networking / VPC / ALB](../overview/infrastructure/networking.md) — topology context for the
  [SSE / long-lived connection principle](reference-runtime-timeouts-principle-sse-long-lived-connection-duration-under-fargate-spot.md#principle-sse--long-lived-connection-duration-under-fargate-spot);
  Fargate Spot capacity provider strategy lives in `vouchington-infra/opentofu/locals.tf`.
- [`backend/modules/utils/README.md`](../../backend/modules/utils/README.md) — module index
  including `http-dispatchers.mts`.
