# Exports

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#exports)

### `createOpenAIResponse(params, options?)`

Thin wrapper around `openai.responses.create()`. Marked `/* no-mistakes: integration=openai */` so agents can mock it in tests.

```typescript
import { createOpenAIResponse } from '@agents/_shared'

const response = await createOpenAIResponse({
  model: 'gpt-5.4-nano',
  instructions: 'You are a helpful assistant.',
  input: 'What is 2+2?',
})
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
import { createOpenAIResponse, QUEUED_BACKGROUND_RETRY_POLICY } from '@agents/_shared'

const response = await createOpenAIResponse(
  { model: 'gpt-5.4-nano', instructions: systemPrompt, input: userInput },
  { maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries },
)
```

### `buildAgentTools(currentUser, entries)`

Converts an array of `Tool` definitions into `AgentTool[]` for use with `executeToolCalls` or `runToolLoop`. Eliminates per-tool boilerplate.

```typescript
import { buildAgentTools } from '@agents/_shared'

// Simple tools
const { agentTools } = buildAgentTools(currentUser, [searchPostsTool, searchRssFeedItemsTool])
```

`buildAgentTools` also forwards `formatResult` from each tool if present.

### `agentToolsToSchemas(tools)`

Extracts OpenAI-shaped tool schemas from an `AgentTool[]`. Returns `unknown` — callers cast with `as never` to satisfy the OpenAI Responses API's loosely typed `tools` parameter.

```typescript
import { buildAgentTools, agentToolsToSchemas } from '@agents/_shared'

const { agentTools } = buildAgentTools(currentUser, [...])
const toolSchemas = agentToolsToSchemas(agentTools) as never
// pass toolSchemas to createOpenAIResponse({ tools: toolSchemas, ... })
```

### `parseLLMJsonResponse<T>(text)`

Strips markdown code fences (` ```json ` or ` ``` `) from LLM text and parses as JSON. Throws `SyntaxError` with a descriptive message on failure.

```typescript
import { parseLLMJsonResponse } from '@agents/_shared'

// Works with bare JSON or fenced JSON
const parsed = parseLLMJsonResponse<{ title: string; summary: string }>(responseText)
```

Use this in single-call agents (story-post) that expect structured JSON responses.

### `runToolLoop(config): Promise<RunToolLoopResult>`

Runs an OpenAI tool-calling loop until the model stops requesting tool calls or `maxIterations` is reached. On max iterations, makes one final call with `tool_choice: 'none'` to extract a text response.

```typescript
import { runToolLoop } from '@agents/_shared'

const { text, iterations, terminationReason, lastResponseId } = await runToolLoop({
  model: 'gpt-5.4-nano',
  instructions: systemPrompt,
  tools: agentTools,
  input: userMessage,
  maxIterations: 3,
  safetyIdentifier: currentUser.id,
  extraParams: { service_tier: 'flex', prompt_cache_key: 'my-agent-v1' },
})
```

**Config:**

| Field                | Type                                                | Description                                                                                                                            |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `model`              | `string`                                            | OpenAI model name                                                                                                                      |
| `instructions`       | `string` (optional)                                 | System prompt; may be omitted                                                                                                          |
| `tools`              | `AgentTool[]`                                       | Tool schemas + executor functions (use `buildAgentTools`)                                                                              |
| `input`              | `string \| ResponseInput`                           | Initial text or native OpenAI Responses API input items                                                                                |
| `maxIterations`      | `number`                                            | Max tool-call iterations before final fallback                                                                                         |
| `safetyIdentifier`   | `string`                                            | Identifier for OpenAI safety logging                                                                                                   |
| `previousResponseId` | `string` (optional)                                 | Seed a prior response ID to chain off an existing conversation                                                                         |
| `extraParams`        | `Record<string, unknown>` (optional)                | Additional OpenAI params (service_tier, prompt_cache_key, etc.)                                                                        |
| `metadata`           | `Record<string, string>` (optional)                 | Metadata forwarded to each `createOpenAIResponse` call                                                                                 |
| `onCallError`        | `(toolCall, error) => void` (optional)              | Called on any tool execution error (defaults to `onError`)                                                                             |
| `onBeforeCall`       | `(toolCall) => skip \| undefined` (optional)        | Run before each tool call; return `{ skip: true }` to skip it                                                                          |
| `onAfterCall`        | `(toolCall, result) => void` (optional)             | Run after each successful tool call                                                                                                    |
| `onIteration`        | `(ctx) => { stop, reason } \| undefined` (optional) | Called each iteration before tool calls; return `{ stop: true, reason }` to stop early                                                 |
| `onAfterIteration`   | `(ctx) => { stop, reason } \| undefined` (optional) | Called after tool calls finish each iteration; return `{ stop: true, reason }` to stop early without the `tool_choice:'none'` fallback |

**Result:**

| Field               | Type                  | Description                                                                                                          |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `text`              | `string \| null`      | Extracted response text, or null if extraction fails                                                                 |
| `iterations`        | `number`              | Number of loop iterations executed                                                                                   |
| `terminationReason` | `string`              | Why the loop ended (`'no_tool_calls'`, `'max_iterations'`, or a custom reason from `onIteration`/`onAfterIteration`) |
| `lastResponseId`    | `string \| undefined` | Response ID of the last OpenAI call, for chaining                                                                    |

Keep trusted `instructions` separate from message `input`. Provider adapters may submit typed
user/assistant history as `ResponseInput`; tool-loop iterations replace that seed input with native
`function_call_output` items while continuing from the latest response ID.

Usage-recording and token-accounting exports (`runWithJobTokenAccumulator`,
`recordAgentResponseUsage`, `callRecordingAgentResponseUsage`) are documented in
[Usage Tracking](reference-usage-tracking.md).
