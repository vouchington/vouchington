# Agent Patterns

[Back to Agents Architecture](../../../../backend/agents/README.md#agent-patterns)

### 1. Single call

One LLM call. Use `createOpenAIResponse` directly, optionally with `parseLLMJsonResponse` for structured JSON.

**Used by:** `story-post`

```typescript
import { createOpenAIResponse, parseLLMJsonResponse } from '@agents/_shared'

const response = await createOpenAIResponse({ model, instructions, input })
const text = extractTextFromOpenAIResponse(response)
const parsed = parseLLMJsonResponse<MyType>(text)
```
