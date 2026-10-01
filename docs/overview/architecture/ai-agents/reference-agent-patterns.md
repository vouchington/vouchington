# Agent Patterns

[Back to Agents Architecture](../../../../backend/agents/README.md#agent-patterns)

### 1. Single call

One LLM call, no tool loop. Use `createOpenAIResponse` directly, optionally with `parseLLMJsonResponse` for structured JSON.

**Used by:** `moderation`, `story-clustering`, `story-post`

```typescript
import { createOpenAIResponse, parseLLMJsonResponse } from '@agents/_shared'

const response = await createOpenAIResponse({ model, instructions, input })
const text = extractTextFromOpenAIResponse(response)
const parsed = parseLLMJsonResponse<MyType>(text)
```

### 2. `runToolLoop`

Standard iterative tool-calling loop. Handles termination, final fallback call, and observability hooks automatically.

**Used by:** `autotagger`

```typescript
import { runToolLoop, buildAgentTools } from '@agents/_shared'

const { agentTools } = buildAgentTools(currentUser, [searchPostsTool, searchRssFeedItemsTool])
const { text, iterations, terminationReason } = await runToolLoop({
  model,
  instructions,
  tools: agentTools,
  input,
  maxIterations,
  safetyIdentifier: currentUser.id,
})
```
