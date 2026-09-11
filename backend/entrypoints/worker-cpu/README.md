# worker-cpu Entrypoint

Entry point for the CPU-capable worker container. It can load every worker definition, including
Rust NAPI addons and Lightpanda cloud browser crawling. Local development filters it to CPU queues.

## Queues

| Queue                                          | Notes                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `crawl_urls`                                   | HTML download + Rust sanitization                                              |
| `crawl_hostnames`                              | Hostname crawls (Rust HTML)                                                    |
| `crawl_referral_links`                         | Referral link crawls (Rust HTML)                                               |
| `crawl_html_boilerplate_removal`               | Rust boilerplate stripper                                                      |
| `crawl_browser`                                | Lightpanda cloud headless browser (`requiresExplicitInclusion`)                |
| `images`                                       | Sharp image processing                                                         |
| `ai_agents`                                    | `@jongleberry/vurst-ai` text classification                                    |
| `openai-spend-cap-rechecks`                    | Limiter-independent release coordinator for spend-capped `ai_agents` jobs      |
| `bedrock_embeddings_nova_multimodal_v1_single` | Bedrock embeddings — Rust `htmlToEmbeddingText` via `@services/rss-feed-items` |
| `bedrock-embeddings-batch`                     | Bedrock batch embeddings (scheduled) — same Rust dep                           |

The full queue-classification policy lives in
[`../../modules/worker-queue-inventory/worker-queue-policy.json`](../../modules/worker-queue-inventory/worker-queue-policy.json).
CPU-only queues can run only in this entrypoint; `WORKER_CPU_EXTRA_QUEUES` moves IO-capable queues
here only in local development.

## Grafana IRM heartbeat

When `GRAFANA_IRM_HEARTBEAT_URL` is present, the worker-cpu process posts to
that Grafana IRM heartbeat endpoint immediately at startup and every 60
minutes. The endpoint must use HTTPS on a `grafana.net` host. The timer runs in
worker-cpu itself rather than through the universal `heartbeat` queue, so a
healthy worker-io process cannot mask the loss of all worker-cpu tasks.

The URL contains a credential and must be injected from SSM Parameter Store;
never commit or log it. Local and CI workers leave the variable unset.

## Files

- `index.mts` — process entrypoint and exported runtime controls
- `runtime.mts` — binds CPU definitions, native-addon shutdown, and Grafana heartbeat hooks to the
  shared lifecycle
- `worker-definitions.mts` — all worker-cpu-capable definitions (CPU-only plus IO-capable)
- `serve.mts` — prewarm HTTP server (port from `NODE_PREWARM_PORT`; no server starts if unset) and
  graceful-shutdown wiring
- `nativeAddonShutdown.mts` — drains Rust NAPI work on graceful shutdown

## Related

- Shared worker framework: [../../worker-runtime/](../../worker-runtime/)
- Worker packages: [../../workers/CLAUDE.md](../../workers/CLAUDE.md)
- Queue packages: [../../queues/CLAUDE.md](../../queues/CLAUDE.md)
- Local entrypoint rules: [CLAUDE.md](CLAUDE.md)
