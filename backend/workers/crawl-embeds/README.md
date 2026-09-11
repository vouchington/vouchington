# Crawl embeds worker

The I/O worker runs `resolve_crawl_oembed` and `backfill_crawl_embeds` jobs. It delegates all
durable lookup, endpoint fetch, retry classification, crawl-local conditional update, and bounded
backfill behavior to `@services/crawl-embeds`.

## Durable transition matrix

| Failure mode                            | Detectable state                                           | Recovery/reconciliation path                  | Idempotency guarantee                | Evidence                                          |
| --------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| Dispatch failure                        | Crawl has pending oEmbed endpoint and no completion marker | Crawl-embed backfill re-enqueues the crawl ID | Crawl-local pending marker           | `services/crawls/__tests__/crawl-oembed.test.mts` |
| Provider non-consumption                | Job retry / endpoint remains pending                       | Bounded retry then backfill                   | Conditional crawl update             | `services/crawls/__tests__/crawl-oembed.test.mts` |
| Provider consumption, DB commit failure | Endpoint remains pending after queue retry                 | Replay reads the same crawl                   | Conditional crawl update             | `services/crawls/__tests__/crawl-oembed.test.mts` |
| Durable commit, reply loss              | Completion marker is present                               | Replay skips the completed crawl              | Completion marker predicate          | `services/crawls/__tests__/crawl-oembed.test.mts` |
| Retry/reconciliation                    | Endpoint remains pending                                   | Retry or bounded backfill                     | Same crawl ID and conditional update | `services/crawls/__tests__/crawl-oembed.test.mts` |
| TTL expiry                              | GlideMQ retention expires                                  | Backfill scans pending crawl state            | Durable crawl state                  | `queues/crawl-embeds/enqueues.test.mts`           |
| Orphan cleanup                          | Crawl deleted or endpoint removed                          | Processor skips absent/non-pending crawl      | No write without matching crawl      | `services/crawls/__tests__/crawl-oembed.test.mts` |
| Normal terminal removal                 | Completion marker is present                               | No recovery necessary                         | Completion marker predicate          | `services/crawls/__tests__/crawl-oembed.test.mts` |

## Related

- Queue: [../../queues/crawl-embeds/README.md](../../queues/crawl-embeds/README.md)
- I/O entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
