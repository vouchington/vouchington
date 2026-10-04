# Native Conversation Sync

[Back to AI Agents](ai-agents.md)

## Transcript and generation boundaries

`@services/conversations-messages` persists client-generated turns for native local models and
configured endpoints. Each conversation tracks:

- `conversations` — top-level thread per user
- `conversation_messages` — user and assistant transcript entries
- Assistant message JSON — completion `model_provider` and `model_name`, beside the turn fingerprint

The `client-generated-chat` route checks both the user message and the assistant content with
`checkApiMessageSafety()` before it persists the turn.

Native clients can use an on-device model or a configured local endpoint. They persist a completed
turn through `POST /api/v1/conversations/:conversationId/client-generated-chat`; the API accepts
`apple_foundation`, `windows_foundry`, `android_aicore` and `openai_compatible` model providers.
The backend stores no local endpoint URL, API key or model list. See the
[conversation API contract](../../requirements/api/v1/conversations/README.md) for provider names,
message identity and retry rules.

The server separately generates a conversation title through one bounded title-generation operation in
[`@agents/conversation-title`](ai-agents/conversation-title/README.md). That agent reads and
sanitizes up to two recent messages, then records usage through the shared agent boundary. It does not
generate assistant transcript turns. Retained classifiers and focused agents are mapped in the
[agent package index](ai-agents/README.md).
