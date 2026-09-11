# @modules/queue-errors

Helpers for classifying job failures in glide-mq processors. Generic terminal, HTTP retry, and
rate-limit mechanics come from [`@vouchington/queue-errors`](https://www.npmjs.com/package/@vouchington/queue-errors);
this adapter owns Voucha's AWS and Bedrock semantics. Wrapping non-retriable errors in
`UnrecoverableError` tells glide-mq to skip remaining retry attempts immediately, instead of
burning all configured retries on failures that will never succeed.

## Exports

### `UnrecoverableError`

Re-exported directly from `glide-mq`. The generic helpers in `@vouchington/queue-errors` construct
their terminal and rate-limit errors from constructors injected by this adapter — `UnrecoverableError`
and `Worker.RateLimitError` — rather than from copies of their own, so glide-mq's worker and test shim
see the real glide-mq classes when they check `instanceof UnrecoverableError` (and
`err.name === 'UnrecoverableError'`) to decide whether to skip retries. There is no local translation
layer.

### `unrecoverable(err, message?): never`

Throws an `UnrecoverableError` from an existing error. Pass an optional `message` to override the error text.

```ts
import { unrecoverable } from '@modules/queue-errors'

const entity = await getEntity(id)
if (!entity) unrecoverable(new Error(`entity ${id} not found`))
```

### `wrapHttpForRetry(err: unknown): never`

Converts 4xx HTTP errors (except 408 timeout and 429 rate-limit) to `UnrecoverableError`; rethrows everything else so glide-mq retries normally.

```ts
import { wrapHttpForRetry } from '@modules/queue-errors'

// In a processor:
await callExternalApi(id).catch(wrapHttpForRetry)
// 4xx (bad input, permission, not found) → UnrecoverableError → no retry
// 408 (timeout), 429 (rate-limit), 5xx, network errors → rethrow → glide-mq retries with backoff
```

The adapter extracts HTTP status in this order: `status`, `statusCode`, then AWS SDK v3
`$metadata.httpStatusCode`.

### `handleBedrockRateLimit(error, worker): Promise<never>`

Recognizes Bedrock `ThrottlingException` and AWS SDK v3 429 metadata, pauses the worker for the
fixed 60-second Bedrock cooldown, then signals GlideMQ to retry the current job. Other errors flow
through `wrapHttpForRetry`.

## Error Classification

| Error type                                              | Action                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| Non-retryable 4xx HTTP (except 408 and 429)             | `wrapHttpForRetry(err)`                  |
| Validation error / missing entity                       | `unrecoverable(err)`                     |
| Soft-deleted entity (processor early-exits after fetch) | `return` early — already idempotent      |
| 429 rate-limit, 5xx HTTP, network error, DB connection  | re-throw — glide-mq retries with backoff |

## Related

- Parent: [../README.md](../README.md)
- Error handling: [../on-error/README.md](../on-error/README.md)
- Queue system conventions: [../../queues/CLAUDE.md](../../queues/CLAUDE.md)
