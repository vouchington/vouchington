# Choosing an Agent Pattern

[Back to @agents/\_shared](README.md#choosing-an-agent-pattern)

Pick the simplest pattern that fits your agent's needs:

1. **Single call** — use `createOpenAIResponse` directly when no tool use is needed (story-post, story-clustering). Combine with `parseLLMJsonResponse` for structured JSON responses.

2. **`runToolLoop`** — use when the agent calls tools iteratively and returns a text result (crm-outreach, customer-support, wikipedia-recommender). Supports all observability hooks.

3. **`runToolLoopStreaming`** — use when the caller needs real-time events per tool call (chat orchestrator). Yields a `RunToolLoopStreamEvent` union and returns `RunToolLoopResult`. Subagent generators inside tools propagate `subagent_step` events automatically via `yield*`.
