# Agent Patterns

[Back to Agents Architecture](../../../../backend/agents/README.md#agent-patterns)

### 1. Single call

One provider call. Use `createOpenAIResponse` for direct OpenAI workloads or
`createOpenRouterResponse` for retained OpenRouter workloads, optionally with
`parseLLMJsonResponse` for structured JSON.

**Used by:** `story-post`

```typescript
import {
  callRecordingAgentResponseUsage,
  createOpenRouterResponse,
  parseLLMJsonResponse,
  toOpenRouterModel,
} from '@agents/_shared'

const response = await callRecordingAgentResponseUsage(
  () => createOpenRouterResponse({ model: toOpenRouterModel(model), instructions, input }),
  { agentSlug: 'story-post', responseProvider: 'openrouter' },
)
const text = extractTextFromOpenAIResponse(response)
const parsed = parseLLMJsonResponse<MyType>(text)
```
