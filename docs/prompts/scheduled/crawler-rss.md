Review crawler and RSS ingestion behavior. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Check [RSS feed crawling](../../requirements/content/RSS-FEED-CRAWLING.md) and [Crawling](../../overview/architecture/crawling.md) against robots.txt, domain rate limits, retries, dedupe, feed parsing, sanitization, and crawl queue behavior, without increasing crawl load.
- Queue changes follow `voucha-queue-authoring`, `vouchington-backend-tests`, and [backend-queues.md](../../checklists/backend-queues.md); prove them against real PostgreSQL, Valkey, and GlideMQ.
- Deadline coverage: each fetch deadline must cover reading the body, and a body must be cancelled before an ignored 4xx/5xx is discarded, so a stalling server cannot hold a worker. Prove it with a test that stalls the body.
