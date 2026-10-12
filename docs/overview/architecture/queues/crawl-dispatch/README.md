# Crawl Dispatch Queue

Source entrypoint: [backend/queues/crawl-dispatch/README.md](../../../../../backend/queues/crawl-dispatch/README.md)

The ranked `crawl-dispatch` queue combines [hostname crawl dispatch](../crawl-hostnames/README.md) with [HTML boilerplate removal](../crawl-boilerplate-removal/README.md). Each job retains its name, payload, deduplication, retry, and scheduler ID. Hostname sweeps retain their bounded persisted cursor; boilerplate removal retains its 60-second debounce and daily `0 5 * * *` schedule.

The [shared CPU worker](../workers/crawl-dispatch/README.md) has baseline concurrency 8 instead of two independent baseline-5 pools. This conservatively caps aggregate dispatch and HTML extraction pressure while letting either family use idle slots; a long boilerplate run can delay dispatch, and throughput has not been benchmarked.

`crawl_urls` remains separate at priority zero with its per-host ordering lane and distinct lock policy. `crawl_referral_links`, `crawl_browser`, `unfurl_referral_links`, and `crawl_embeds` retain their own constraints and queues.
