# Conversation Title Agent

Source entrypoint: [backend/agents/conversation-title/README.md](../../../../../backend/agents/conversation-title/README.md)

Generates a short title for a conversation from its first messages. It is a single OpenAI Responses
call with no tools, called synchronously by
`POST /api/v1/my/conversations/:conversationId/title`, not through a queue.

## Files

| File                 | Description                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| `generate-title.mts` | Title input builder, model call and `generateChatTitle()` convenience wrapper |
| `index.mts`          | Barrel exports                                                                |

## Exports

- `getConversationTitleGenerationInput(conversationId)` — loads up to the first two messages,
  truncates each to 1,000 characters, sanitizes and wraps them as external data, and returns the
  prompt text. It returns `null` when the conversation has no message content yet.
- `generateChatTitleFromInput(input, userId)` — makes the model call and returns a trimmed title
  with surrounding quotes removed, falling back to `New Conversation` for empty output.
- `generateChatTitle(conversationId, userId)` — the two steps together.

## Rules

- The route calls `getConversationTitleGenerationInput()` first so a `null` result skips the model
  call, and the spend-cap check that only gates it, and falls back to the local `New Conversation`
  title.
- For a non-null input the route calls `assertOpenAiSpendCapNotBreached('chat-generate-title')`
  before `generateChatTitleFromInput()`. See
  [the daily spend cap](../../queues/workers/ai-agents/README.md#daily-spend-cap).
- The model call records its ledger row through `callRecordingAgentResponseUsage()` for both
  successful and failed or incomplete responses, under the agent slug `chat-generate-title`. That
  slug is persisted spend and usage data, so it is not renamed with the package.
- `userId` is passed as the OpenAI `safety_identifier`; there is no dedicated system user.
- Stored message content is sanitized and wrapped before it enters the prompt.

## Related

- Chat agent: [../chat/README.md](../chat/README.md)
- Shared agent utilities: [../_shared/reference-used-by.md](../_shared/reference-used-by.md)
- Agents overview: [../AGENTS.md](../../../../../backend/agents/AGENTS.md)
