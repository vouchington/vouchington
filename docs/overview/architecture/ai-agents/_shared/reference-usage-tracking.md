# Usage Tracking

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#usage-tracking)

### `runWithJobTokenAccumulator(fn, onSettled)` / `addAccumulatedTokens(count)`

`AsyncLocalStorage`-scoped per-job TPM accumulator (`token-accumulator.mts`), so a glide-mq
`tokenLimiter` can throttle on real token consumption instead of staying permanently inert.
`recordAgentResponseUsage` (below) calls `addAccumulatedTokens` on every OpenAI response it
records — direct calls and the tool loop both flow through it — so no call site needs to opt in
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

### `recordAgentResponseUsage(params)`

Awaited `ai_usage_records` settlement for a single completed OpenAI call, shared by
`callRecordingAgentResponseUsage` (below) and the tool loop's usage recording. No-ops when
`params.response.usage` is absent (e.g. a test double that doesn't model the real API shape). A
storable completed-response ID is used first, followed by a storable registration ID. Any supplied
unusable ID is reported without echoing its value, as is a response with both IDs absent. When
neither is storable, known billed usage is recorded without an idempotency key. A successful keyless
write does not set the request-day accounting-uncertainty latch. A real ledger failure must durably
set that latch before control can advance; if both writes fail, the caller fails closed. A live
background lease still settles under its registration ID and fencing token.

### `callRecordingAgentResponseUsage(fn, params)`

Wraps a direct (non-tool-loop) `createOpenAIResponse` call, recording the ledger row for both a
resolved response and a thrown `OpenAIResponseNotCompletedError` (which still billed tokens)
before rethrowing.

It also installs the physical-attempt accounting hooks used by `@modules/openai-utils`: the first
attempt has already passed the wrapper's spend-cap check, every known-unbilled flex-capacity retry
and the single default-tier resend that follows flex capacity exhaustion recheck immediately before
dispatch, and an ambiguous potentially billed attempt with no usage awaits the request-day
`unknown_billed_attempt` latch before the error can escape. A streamed flex capacity failure is
positively unbilled, so it does not latch; the resend's ledger row carries the served `default` tier.

### `createStructuredDecisionBillingHooks(subject)`

Composes one structured-decision workload's spend admission, known-billed usage recording, and
ambiguous-attempt accounting latch. `subject.workload` is the `ai_usage_records.agent_slug`; the
optional post and community identities are carried to the usage row. Its optional receipt
`beforeAttempt` runs **after** cap admission, so a rejected request does not consume an owned
provider-attempt budget. The structured-decision module stays independent of this accounting
policy and invokes these hooks only at its one physical request boundary.
