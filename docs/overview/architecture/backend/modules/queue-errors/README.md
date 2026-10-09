# @modules/queue-errors

Source entrypoint: [backend/modules/queue-errors/README.md](../../../../../../backend/modules/queue-errors/README.md)

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

Classifies an HTTP failure for glide-mq; it rethrows everything it does not recognize.

```ts
import { wrapHttpForRetry } from '@modules/queue-errors'

// In a processor:
await callExternalApi(id).catch(wrapHttpForRetry)
// 4xx (bad input, permission, not found) → UnrecoverableError → no retry
// 429 that states its wait (Retry-After) → rate-limit signal → requeued after that wait, no attempt used
// AWS throttling (SES `Throttling`, HTTP 400) → rethrow → glide-mq retries with backoff
// 408, other 429s, 5xx, network errors → rethrow → glide-mq retries with backoff
```

The adapter extracts HTTP status in this order: `status`, `statusCode`, then AWS SDK v3
`$metadata.httpStatusCode`. A 429's wait comes from a parsed `retryAfterMs` field (the shape of
`HttpRateLimitError`) or a `Retry-After` header on the error's `headers`. A `Retry-After` on a 5xx is
not honored: a requeue never consumes an attempt, so an unreachable host that keeps naming a wait
would never fail.

SES reports `Throttling` ("Maximum sending rate exceeded", and its daily quota) as HTTP 400, which
the status alone would drop as a permanent client error. SES rejects it before sending, so
`isAwsThrottlingError` lets the email queue retry it without risking a duplicate email. Any other
SES 400 (`MessageRejected`, `AccountSendingPausedException`) stays unrecoverable.

### Rate-limit signal

GlideMQ's `Worker.RateLimitError` requeues the job after `error.delayMs` without consuming an attempt.
Its constructor takes no argument, and GlideMQ replaces a falsy `delayMs` with the worker limiter's
duration (about one second), so a bare `new Worker.RateLimitError()` drops the provider's wait. Build
it through these helpers instead; the `backend-no-worker-ratelimit` ast-grep rule rejects a bare
construction and any `worker.rateLimit(ms)` call.

| Export                                                  | Behavior                                                                                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clampRateLimitDelayMs(ms?)`                            | Clamps to `MIN_RATE_LIMIT_DELAY_MS` (1 s) through `MAX_RATE_LIMIT_DELAY_MS` (15 min); `DEFAULT_RATE_LIMIT_DELAY_MS` (1 min) when none                                                                       |
| `createRateLimitError(ms?, cause?)`, `throwRateLimited` | The signal, carrying the clamped `delayMs` and the failure as `cause`                                                                                                                                       |
| `throwIfRateLimitedResponse(response, endpoint)`        | Cancels the unread body of a 429 `fetch` response, then throws the signal; `cause` is an `HttpRateLimitError` with status and wait                                                                          |
| `boundRateLimitDeferral(job, run)`                      | Runs a processor; once `job` is older than `MAX_RATE_LIMIT_DEFERRAL_AGE_MS` (24 h) a requeue signal becomes its plain `cause`, so the job spends attempts and ends. For hosts the operator does not control |
| `deferJobForRateLimit(job, ms?)`                        | Parks only `job` with `job.moveToDelayed()`; never resolves                                                                                                                                                 |
| `getRetryAfterMs(error)`                                | The wait a failure names (`retryAfterMs` or a `Retry-After` header), or `null`                                                                                                                              |

The wait travels with the job, so every replica that receives a 429 honors it. `worker.rateLimit(ms)`
only set a timestamp in that one process, so other replicas kept calling the provider. GlideMQ also
makes a worker with a `limiter` idle itself for the signal's `delayMs`. That suits a queue whose jobs
all call the same provider, but it holds back provider-free jobs that share the worker (reconcilers),
so `ai_agents` uses `deferJobForRateLimit` instead.

### `handleBedrockRateLimit(error, worker): Promise<never>`

Recognizes Bedrock `ThrottlingException` and AWS SDK v3 429 metadata, then signals GlideMQ to requeue
the current job after the fixed 60-second Bedrock cooldown. Other errors flow through
`wrapHttpForRetry`. The upstream `handleRateLimitedError` still calls `worker.rateLimit(cooldownMs)`
first; that call is redundant because GlideMQ applies the signal's `delayMs` itself.

## Error Classification

| Error type                                                                      | Action                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Non-retryable 4xx HTTP (except 408 and 429)                                     | `wrapHttpForRetry(err)`                                                       |
| 429 with a stated `Retry-After`                                                 | `wrapHttpForRetry(err)` or `throwRateLimited(ms)` (requeued, no attempt used) |
| Validation error / missing entity                                               | `unrecoverable(err)`                                                          |
| Soft-deleted entity (processor early-exits after fetch)                         | `return` early — already idempotent                                           |
| 429 with no stated wait, 5xx HTTP, network error, DB connection, AWS throttling | re-throw — glide-mq retries with backoff                                      |

## Related

- Parent: [../README.md](../README.md)
- Error handling: [../on-error/README.md](../on-error/README.md)
- Queue system conventions: [../../queues/AGENTS.md](../../../../../../backend/queues/AGENTS.md)
