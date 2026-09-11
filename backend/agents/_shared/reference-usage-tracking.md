# Usage Tracking

[Back to @agents/\_shared](README.md#usage-tracking)

### `runWithJobTokenAccumulator(fn, onSettled)` / `addAccumulatedTokens(count)`

`AsyncLocalStorage`-scoped per-job TPM accumulator (`token-accumulator.mts`), so a glide-mq
`tokenLimiter` can throttle on real token consumption instead of staying permanently inert.
`recordAgentResponseUsage` (below) calls `addAccumulatedTokens` on every OpenAI response it
records — direct calls, the tool loop, and the streaming tool loop all flow through it — so no
call site needs to opt in individually. `addAccumulatedTokens` is a no-op outside an active scope
(e.g. a script run directly, or most existing tests).

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
ledger failure must durably set the request-day accounting-uncertainty latch before control can
advance; if both writes fail, the caller fails closed.

### `callRecordingAgentResponseUsage(fn, params)`

Wraps a direct (non-tool-loop) `createOpenAIResponse` call, recording the ledger row for both a
resolved response and a thrown `OpenAIResponseNotCompletedError` (which still billed tokens)
before rethrowing.

It also installs the physical-attempt accounting hooks used by `@modules/openai-utils`: the first
attempt has already passed the wrapper's spend-cap check, every known-unbilled flex-capacity retry
rechecks immediately before dispatch, and an ambiguous potentially billed attempt with no usage
awaits the request-day `unknown_billed_attempt` latch before the error can escape.
