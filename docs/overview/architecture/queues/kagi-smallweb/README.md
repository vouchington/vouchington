# Kagi Small Web System

Source entrypoint: [backend/queues/kagi-smallweb/README.md](../../../../../backend/queues/kagi-smallweb/README.md)

Triggers periodic synchronization of RSS feeds from Kagi Small Web feed lists.

## Queue Configuration

### Domain: `kagi-smallweb`

Domain `kagi-smallweb` of the shared [`background` queue](../background/README.md); job names are
`kagi-smallweb.<name>`. The feed imports share a domain-wide group of 5 (the old worker concurrency); the sync pages run
in their own singleton lane `kagi-smallweb:dispatcher`, outside the group. It adds a worker baseline
of five. Pause it from the admin
queue page like any other domain. The `kagi-smallweb` queue and `WORKER_CONCURRENCY_KAGI_SMALLWEB`
no longer exist.

- **`kagi-smallweb.sync`** (lane `kagi-smallweb:dispatcher`, concurrency 1, priority 100)
  - Daily cron (`0 5 * * *`). Fetches the three Small Web lists and enqueues one bounded page of new
    feeds as `kagi-smallweb.processFeed` jobs. A page is at most `candidate_batch_size` candidates
    (`kagi-smallweb-config`, default 500, ceiling 5,000), ordered by feed URL.
  - A page that leaves candidates over enqueues a continuation `sync` job carrying the last feed URL
    as `cursor`; its job id is a digest of that cursor, so a retried page cannot enqueue it twice.
    The first page asks for changed lists only (`ETag`); a continuation reads every list again.
- **`kagi-smallweb.processFeed`** (domain group `kagi-smallweb`, concurrency 5, priority 10)
  - Creates the topic, hostname link, and RSS feed for one entry; deduplicated per feed URL for 24 hours.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Kagi Small Web service: [../../services/kagi-smallweb/README.md](../../services/kagi-smallweb/README.md)
- RSS feeds system: [../rss-feeds/README.md](../rss-feeds/README.md)
