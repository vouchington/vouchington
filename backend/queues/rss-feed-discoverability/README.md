# RSS Feed Discoverability

Worker-owned system for evaluating whether an RSS feed should be publicly discoverable.

- Queue: `rss-feed-discoverability`
- Worker: `rssFeedDiscoverability`
- Processor: `processEvaluateRssFeedDiscoverability`

The processor reads the feed's owning topic score, follow count, and publisher type relation. Aggregators and forums are forced undiscoverable. Other feeds use `rss-feed-discoverability-config` thresholds. System writes preserve human overrides by refusing to change feeds whose latest discoverability row was written by a non-system user.

Service details live in [../../services/rss-feeds/README.md](../../services/rss-feeds/README.md). The worker is run by the [worker-io entrypoint](../../entrypoints/worker-io/worker-definitions.mts) and summarized in [../README.md](../README.md).
