# Choosing an Agent Pattern

[Back to @agents/\_shared](../../../../../backend/agents/_shared/README.md#choosing-an-agent-pattern)

Pick the simplest pattern that fits your agent's needs:

1. **Single call** — use `createOpenAIResponse` directly when no tool use is needed (story-post). Combine with `parseLLMJsonResponse` for structured JSON responses.

2. **`runToolLoop`** — use when the model needs tools and the caller only needs the final result (autotagger). Build the tools with `buildAgentTools`; the loop returns a `RunToolLoopResult`.
