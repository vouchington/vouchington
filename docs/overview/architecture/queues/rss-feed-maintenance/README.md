# RSS Feed Maintenance Queue

Source entrypoint: [backend/queues/rss-feed-maintenance/README.md](../../../../../backend/queues/rss-feed-maintenance/README.md)

The ranked `rss-feed-maintenance` queue carries three related IO job families: [RSS item categories](../rss-feed-item-categories/README.md), [feed discoverability](../rss-feed-discoverability/README.md), and [topic aliases](../topic-aliases/README.md). Each domain retains its job names, payloads, deduplication, retries, and priority. Snapshot reconciliation, alias category-mapping reconciliation, and alias post invalidation retain separate ordering lanes at concurrency 1. The two reconciliation schedules keep their IDs and five-minute cadence under this one queue name.

One [RSS maintenance worker](../workers/rss-feed-maintenance/README.md) has baseline concurrency 10. This bounds aggregate PostgreSQL and cache pressure below the former three independent baseline-5 pools, while allowing the job families to share available capacity. A long backlog in one family can delay the others; the concurrency choice is conservative and has not been throughput-benchmarked.
