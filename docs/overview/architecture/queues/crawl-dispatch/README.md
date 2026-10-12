# Crawl Dispatch Queue

Source entrypoint: [backend/queues/crawl-dispatch/README.md](../../../../../backend/queues/crawl-dispatch/README.md)

The ranked `crawl-dispatch` queue combines [hostname crawl dispatch](../crawl-hostnames/README.md) with [HTML boilerplate removal](../crawl-boilerplate-removal/README.md). Each job retains its name, payload, deduplication, retry, and scheduler ID. Hostname sweeps retain their bounded persisted cursor; boilerplate removal retains its 60-second debounce and daily `0 5 * * *` schedule.

The [shared CPU worker](../workers/crawl-dispatch/README.md) has baseline concurrency 8 instead of two independent baseline-5 pools. This caps aggregate dispatch and HTML extraction pressure while letting either family use idle slots. Boilerplate removal jobs have priority 10 and serialize HTML extraction within the process; hostname dispatchers have priority 100. A boilerplate backlog can occupy all eight slots and delay hourly dispatch until those jobs finish. Throughput and worst-case delay have not been benchmarked.

`crawl_urls` remains separate at priority zero with its per-host ordering lane and distinct lock policy. `crawl_referral_links`, `crawl_browser`, `unfurl_referral_links`, and `crawl_embeds` retain their own constraints and queues.
