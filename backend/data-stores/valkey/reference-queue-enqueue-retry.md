# Queue Enqueue Retry

[Back to Valkey Data Store](README.md#queue-enqueue-retry)

[`valkey-glide-mq/glide-mq-retry.mts`](../valkey-glide-mq/glide-mq-retry.mts) wraps queue enqueue calls with explicit retry settings: 3 attempts and an 800-1199 ms jittered delay. The predicate retries only `Reached maximum inflight requests` because Glide rejects that error client-side before the command is written to Valkey. Other transient-looking errors such as connection close or request timeout are ambiguous for non-idempotent queues; the server may already have accepted the enqueue, so retrying could duplicate jobs. Batched entity cache invalidations chunk delete calls above 500 keys per cache to keep Lua argument usage bounded during large alias updates.

Each worker-queue inflight-saturation retry records a breadcrumb for any later terminal error. It
also records a `valkey_inflight_saturation` warning event in Sentry with `client` and `command` tags,
throttled to once per 10 seconds for each client/command pair outside test mode. Exhausted retry
attempts still flow through `onError()` as captured exceptions with the same reason tag.

As of valkyries 0.4.0, `ValkeyCache` reads and `RateLimiter` commands also auto-retry inflight saturation internally (controlled by `VALKEY_INFLIGHT_RETRY_ATTEMPTS` and `VALKEY_INFLIGHT_RETRY_DELAY_MS`). This is a separate retry layer from `glide-mq-retry.mts`, which covers only glide-mq stream commands (XADD, XREADGROUP, XACK). Both layers share the `VALKEY_INFLIGHT_RETRY_ATTEMPTS` env var with matching defaults (3 attempts).
