# Exports

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#exports)

### `createOpenAIResponse(params, options?)`

Re-export of the OpenAI Responses boundary in `@modules/openai-utils`. Its provider module owns
request dispatch and retry behavior.

```typescript
import { callRecordingAgentResponseUsage, createOpenAIResponse } from '@agents/_shared'

const response = await callRecordingAgentResponseUsage(
  () =>
    createOpenAIResponse({
      model: 'gpt-5.4-nano',
      instructions: 'You are a helpful assistant.',
      input: 'What is 2+2?',
    }),
  { agentSlug: 'my-agent' },
)
```

`options` (second parameter) accepts request options, most notably `{ maxRetries }`. The provider
boundary always sends `maxRetries: 0` to the SDK and treats the caller's value as an
application-owned budget for the known-unbilled flex `resource_unavailable` 429. Ambiguous
potentially billed failures latch the request day and stop. Once that budget is spent, or flex
capacity is reported as a streamed failure, a flex request is resent once on the default tier. The
default budget (2) applies to any call that does not set it explicitly. Pick the value from
`backend/agents/_shared/retry-policy.mts` matching the caller's workload —
`SYNCHRONOUS_REQUEST_RETRY_POLICY` (1) or `QUEUED_BACKGROUND_RETRY_POLICY` (2) — rather than
leaving the free-capacity budget implicit. The
full retry-budget table and its accounting contract live in the private
`vouchington/vouchington-docs` repository.

```typescript
import {
  callRecordingAgentResponseUsage,
  createOpenAIResponse,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'

const response = await callRecordingAgentResponseUsage(
  () =>
    createOpenAIResponse(
      { model: 'gpt-5.4-nano', instructions: systemPrompt, input: userInput },
      { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
    ),
  { agentSlug: 'my-agent' },
)
```

### `parseLLMJsonResponse<T>(text)`

Strips markdown code fences (` ```json ` or ` ``` `) from LLM text and parses as JSON. Throws `SyntaxError` with a descriptive message on failure.

```typescript
import { parseLLMJsonResponse } from '@agents/_shared'

// Works with bare JSON or fenced JSON
const parsed = parseLLMJsonResponse<{ title: string; summary: string }>(responseText)
```

Use this in single-call agents (story-post) that expect structured JSON responses.

Keep trusted `instructions` separate from message `input`. Provider adapters may submit typed
user/assistant history as `ResponseInput`.

Usage-recording and token-accounting exports (`runWithJobTokenAccumulator`,
`recordAgentResponseUsage`, `callRecordingAgentResponseUsage`) are documented in
[Usage Tracking](reference-usage-tracking.md).
