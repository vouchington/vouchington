# AI Agents reference

[Back to AI Agents](ai-agents.md)

## LLM Agent Conversations

`@services/conversations-messages` persists chat for native local models as client-generated turns. The hosted chat transport (the SSE `POST /api/v1/conversations/:conversationId/chat` route, the `chat` and `reconcile-chat-runtime-generations` queue jobs, and the Valkey token channel) is removed, and that route returns 404. The chat orchestrator and its research, discovery and profile subagents are removed with it, so no server-side agent answers chat messages. Each conversation tracks:

- `conversations` — top-level thread per user
- `messages` — individual turns (user + assistant)
- Each assistant message records its completion `model_provider` and `model_name` in its JSON content. The agentic-run tables, services and partitions were removed ([A6, #185](https://github.com/vouchington/vouchington/issues/185)); there is no execution-record storage.

The `client-generated-chat` route checks both the user message and the assistant content with
`checkApiMessageSafety()` before it persists the turn.

Native clients can default to local device models when supported. Those responses are generated on
device, then persisted through `POST /api/v1/conversations/:conversationId/client-generated-chat`
with `model_provider: apple_foundation` and `model_name: apple-foundation-system` on Apple
platforms. Windows sends `model_provider: windows_foundry` without a model name so each deployed API
version can select its canonical Windows identity during client-first rollout and backend rollback.
There is no hosted fallback: `client-generated-chat` rejects hosted providers with 400 and the SSE
`/chat` endpoint no longer exists.

Agents that remain (autotagger, moderation and story post) are single-call or
non-streaming `runToolLoop` agents; see [Agent Patterns](ai-agents/reference-agent-patterns.md).
