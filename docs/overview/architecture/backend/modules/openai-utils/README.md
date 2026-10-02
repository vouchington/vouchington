# @modules/openai-utils

Source entrypoint: [backend/modules/openai-utils/README.md](../../../../../../backend/modules/openai-utils/README.md)

OpenAI API utilities — rate limit handling for glide-mq workers and response text extraction from the Responses API.

## Exports

### Rate limit helpers

- `isOpenAIRateLimitError(error): boolean` — detects OpenAI 429 errors
- `isOpenAIFlexResourceUnavailableError(error): boolean` — detects the flex/priority-tier
  "Resource Unavailable" 429 OpenAI returns when no spare capacity exists for that tier right
  now. This specific 429 is **not billed** (OpenAI never started processing the request),
  unlike an ordinary rate-limit or server error, which is why retry-cost accounting treats a
  retry against it as free and a retry against anything else as spend.
- `isOpenAIServerError(error): boolean` — detects 5xx OpenAI API errors. Responses creation
  disables SDK retries; only the response boundary's explicitly unbilled flex retry is automatic.
- `getRetryAfterDuration(error): number` — extracts the `Retry-After` delay in ms (defaults to 60000 ms)
- `handleOpenAIRateLimit(error, worker): Promise<never>` — rate-limits a glide-mq `Worker` and rethrows as `RateLimitError`

### Pricing

- `calcCostMicrounits(model, serviceTier, usage): number | null` — computes cost in
  microunits (1e-6 currency units) from a response's **actual** `model`/`service_tier` and
  `usage`, using the typed `SUPPORTED_MODEL_TIERS` price table. Returns `null` for any
  unpriced model/tier pair (e.g. `gpt-5.4-nano:priority`, which has no price row because
  OpenAI has no Priority-tier offering for that model) rather than guessing.
- `SupportedModel` — type derived from `SUPPORTED_MODEL_TIERS`, so an unsupported model is a
  compile error at any call site that constructs one directly.
- The full pricing matrix, its source/retrieval date, and the refresh procedure for when OpenAI
  updates pricing or ships a new model live in the private `vouchington/vouchington-docs`
  repository.

### Response text

- `extractTextFromOpenAIResponse(response): string` — extracts the text content from a Responses API output, handling both array and simple output formats
- `createOpenAIResponse` accepts either string input or the SDK's native `ResponseInput` array,
  including typed conversation messages and function-call outputs
- `runWithOpenAIResponseAttemptHooks(hooks, callback)` / `OpenAIResponseAttemptHooks` — scopes
  accounting hooks around physical Responses API attempts. The boundary disables SDK retries and
  retries only unbilled flex `resource_unavailable` errors. Ambiguous create or pre-terminal stream
  failures, and terminal failed/incomplete events that omit usage, notify `onUnknownBilledAttempt`
  so callers can fail closed. Recoverable `previous_response_not_found` errors, explicit client
  cancellation (`AbortError` / `APIUserAbortError`), create-level deterministic 4xx, and terminal
  responses that carry usage do not latch. Other stream errors without usage still latch because
  the stream event has no HTTP status. Flex retry delays from `retry-after-ms` / `Retry-After`
  are clamped to 8s, and the abort signal is rechecked after `beforeAttempt`.
- `withOpenAIFlexFallback` (`flex-fallback.mts`) — the one-shot default-tier resend shared by
  `createOpenAIResponse` and `createOpenRouterResponse`. A `service_tier: 'flex'` request that hits
  flex capacity exhaustion is resent **once** with `service_tier: 'default'`, either after the 429 `resource_unavailable` outlasted
  the free retry budget or immediately on a streamed `response.failed` whose `server_error` message is
  "Flex processing is temporarily unavailable" and that carries no usage
  (`isOpenAIFlexCapacityFailedResponseError`, `response-errors.mts`). Both are positively unbilled, so
  the streamed form is not latched as `unknown_billed_attempt`, and the resend re-runs `beforeAttempt`
  with `attempt > 1` so the spend cap is checked again before a call billed at the standard price
  (about twice flex). The resend is outside the `maxRetries` budget, makes at most one extra physical
  request, and a failed resend is rethrown unchanged; non-flex requests and every other error are
  untouched. The fallback is reported through `recordOpenAiFlexFallback` (`@modules/on-error`), and
  the usage ledger prices the resend from the served `default` tier.

### Background mode (#8836)

`background` is deliberately not part of `CreateResponseParams` — `createOpenAIResponse` always
creates in the background, which is baked into this file rather than being a per-caller choice:

- `createOpenAIResponse(params, options?)` — always creates with `background: true` internally and
  drains the stream to a finished `OpenAIResponse`, discarding deltas. It makes one physical request
  unless an unbilled flex `resource_unavailable` result consumes the explicit app retry budget or
  flex capacity triggers the single default-tier resend above; callers and their test doubles are
  otherwise unaffected by the internal background/drain change.
  This is what gives every agent call durability against a worker crash, OOM-kill, or
  ECS rolling-deploy replacement mid-call.
- `cancelOpenAIResponse(responseId)` / `retrieveOpenAIResponse(responseId)`
  (`background-response-teardown.mts`) — the only two ways to touch an in-flight or terminal
  background response after creation, both `maxRetries: 0` with a short timeout since they run on
  abort/shutdown/sweep paths and must never retry-storm. `cancelOpenAIResponse` only stops the
  meter (usage can lag ~10s behind); `retrieveOpenAIResponse` is what actually carries terminal
  usage for the sweeper to record. An [ast-grep rule](../../../../../../ast-grep-rules/openai-teardown-location.yml)
  confines `openai.responses.cancel`/`retrieve` calls to this file, mirroring how
  `openai.responses.create` is confined to `create-response.mts`.
- `runWithBackgroundResponseHooks(hooks, callback)` / `BackgroundResponseHooks`
  (`background-response-context.mts`) — an `AsyncLocalStorage` seam so `createOpenAIResponse` can
  notify the agent layer's usage-recording wrapper of a response id as soon as it's known (the
  `response.created` event), without this module importing anything from `backend/agents` or
  `backend/services`. The hook is awaited: it establishes the durable background-response lease
  before the drain advances. Only that returned lease transfers interrupted-drain recovery authority;
  an ID without a lease remains accounting-uncertain. Its bounded same-token registration retry can delay the drain by up
  to about 10 seconds when PostgreSQL is unavailable. The hook then returns a controller whose
  `stopAndSettle()` waits for any in-flight lease renewal during teardown. The module remains
  independent of registry details.
- `OpenAIResponseNotCompletedError` (`response-errors.mts`) — thrown by `validateCompletedResponse`
  for a terminal `cancelled`/`failed`/`incomplete` response, carrying `usage`/`model`/`service_tier`
  so a cancel result can still be recorded instead of just discarded.

The durable registry, lease/token fencing, response-ID idempotency guarantee, and crash-recovery sweeper that
consume these seams live in
[`@services/openai-background-responses`](../../../services/openai-background-responses/README.md) —
this module never touches that registry directly.

### Client

The OpenAI client proxy is exported as the **default** from `@modules/openai-utils/client` (not re-exported from the barrel). Import directly:

```typescript
import openai from '@modules/openai-utils/client'
```

The client injects `getLongRunningExternalFetch()` because non-streaming model generation can
validly delay complete response headers beyond the routine external dispatcher's 60-second
backstop. Both dispatcher profiles retain the API egress guardrail; see
[runtime timeouts](../../../../../development/runtime-timeouts.md#shared-undici-dispatchers).

## Related

- Parent: [../README.md](../README.md)
- OpenAI agents service: [../../services/openai-agents/README.md](../../../services/openai-agents/README.md)
- Retry policy per workload: [../../agents/_shared/reference-exports.md](../../../ai-agents/_shared/reference-exports.md)
- Usage ledger: [../../services/ai-usage/README.md](../../../services/ai-usage/README.md)
