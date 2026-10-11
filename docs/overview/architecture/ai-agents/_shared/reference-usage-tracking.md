# Usage Tracking

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#usage-tracking)

### `runWithJobTokenAccumulator(fn, onSettled)` / `addAccumulatedTokens(count)`

`AsyncLocalStorage`-scoped per-job TPM accumulator (`token-accumulator.mts`), so a glide-mq
`tokenLimiter` can throttle on real token consumption instead of staying permanently inert.
`recordModelUsage` (below) calls `addAccumulatedTokens` on every provider response it
records — every direct call flows through it — so no call site needs to opt in
individually. `addAccumulatedTokens` is a no-op outside an active scope (e.g. a script run
directly, or most existing tests).

```typescript
import { runWithJobTokenAccumulator } from '@agents/_shared'

// backend/workers/ai-agents/workers/core.mts's processAIAgentWorkerJob:
await runWithJobTokenAccumulator(
  () => processAIAgent(job),
  totalTokens => job.reportTokens(totalTokens),
)
```

`onSettled` runs from an internal `finally`, so tokens accumulated before a mid-job failure are
still reported even when `fn` throws — the throw itself still propagates unchanged. `reportTokens`
is call-once-per-job in glide-mq (a second call overwrites, not adds), which is why the total is
summed internally and reported once at settlement rather than per OpenAI call.

### `recordModelUsage(params)`

Awaited `ai_usage_records` settlement for one billed provider call, whichever provider served it
(`callRecordingModelUsage` below, and `recordAgentResponseUsage` for the jev classifiers). The ledger
row names the provider and `transport` (`direct`, `openrouter`, or the jev `typesafe`) and stores
the provider-neutral `ModelUsage`: the whole prompt as `input_tokens`, cache reads, 5-minute and
1-hour cache writes, output and reasoning tokens. A storable response ID is used first, followed by
a storable registration ID. Any supplied unusable ID is reported without echoing its value, as is a
response with both IDs absent. When neither is storable, known billed usage is recorded without an
idempotency key. A successful keyless write does not set the request-day accounting-uncertainty
latch. A real ledger failure must durably set that latch before control can advance; if both writes
fail, the caller fails closed. A live background lease still settles under its registration ID and
fencing token.

### `recordAgentResponseUsage(params)`

The OpenAI-shaped adapter over `recordModelUsage`: it converts a Responses API result, a thrown
`OpenAIResponseNotCompletedError`, or a jev structured-decision answer (provider `typesafe`) into
`ModelUsage`, and no-ops when the response carried no `usage`.

### `callRecordingModelUsage(run, params)`

Runs one model call and records the ledger row for a resolved result, for a billed 2xx answer that
turned out unusable (a refusal, a truncated or schema-invalid output; the `ModelProviderError`
carries its `billedResponse`), and for a thrown `OpenAIResponseNotCompletedError`, which still
billed tokens, before rethrowing. `params` is `{ agentSlug, selection, openaiTransport, communityId?, postId? }`.

It rechecks the daily spend cap immediately before dispatching and installs the physical-attempt
accounting hooks used by `@modules/openai-utils`: the first attempt has already passed the
wrapper's spend-cap check, every known-unbilled flex-capacity retry and the single default-tier
resend that follows flex capacity exhaustion recheck immediately before dispatch, and an ambiguous
potentially billed attempt with no usage awaits the request-day `unknown_billed_attempt` latch
before the error can escape. A streamed flex capacity failure is positively unbilled, so it does
not latch; the resend's ledger row carries the served `default` tier. Only direct OpenAI runs
inside the background-response scope. An Anthropic failure after the request was sent
(`ambiguousBilled`) latches the same way. A failure that needs an operator (a missing credential,
exhausted credits, a rejected key) raises a `model_provider_alarm` (`recordModelProviderAlarm`),
throttled to once an hour per kind and provider. The worker then ends such a job as unrecoverable
and parks only the job for a provider rate limit or overload, for the provider's `Retry-After`
(`handleModelProviderError`; see the [ai_agents rate-limit handling](../../queues/workers/ai-agents/README.md#provider-rate-limits)).

### `createStructuredDecisionBillingHooks(subject)`

Composes one structured-decision workload's spend admission, known-billed usage recording, and
ambiguous-attempt accounting latch. `subject.workload` is the `ai_usage_records.agent_slug`; the
optional post and community identities are carried to the usage row. Its optional receipt
`beforeAttempt` runs **after** cap admission, so a rejected request does not consume an owned
provider-attempt budget. The structured-decision module stays independent of this accounting
policy and invokes these hooks only at its one physical request boundary.
