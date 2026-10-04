# Choosing an Agent Pattern

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#choosing-an-agent-pattern)

Pick the simplest pattern that fits your agent's needs. There is no shared tool loop; a decision
that scores content belongs in a [classifier](../classifiers/README.md) instead.

1. **Single call** — use `createOpenAIResponse` or `createOpenRouterResponse` inside `callRecordingAgentResponseUsage` when no tool use is needed (story-post uses OpenRouter). Combine with `parseLLMJsonResponse` for structured JSON responses.
