# @services/conversations-messages

Source entrypoint: [backend/services/conversations-messages/README.md](../../../../../backend/services/conversations-messages/README.md)

Manages conversations, their messages, and client-generated native chat turns.

List reads use the repository's [cursor pagination contract](../../pagination.md).
`getConversationsByCreatedById` accepts a decoded simple `after` cursor and probes `limit + 1`.
`getConversationMessagesByConversationId` accepts a decoded simple `after` cursor; API callers pass
an explicit bounded `limit` with `probeForNextPage: true`, while internal mutation/title-generation
callers may retain the purpose-specific unbounded read by omitting `limit`.

Message history is reverse traversal presented chronologically: each response contains the newest
available window in ascending order for display, `start_cursor` identifies the newest returned
message, and `end_cursor` identifies the oldest returned message. Passing `after=end_cursor` loads
the next older window. The `limit + 1` sentinel is older than every returned result and is removed
before cursors are built. Route regressions with three messages and `limit=2` lock this orientation
and prevent gaps or duplicates.

## Key exports

- `createConversation(createdById, title?)` — starts a new conversation
- `createConversationMessage(conversationId, createdById, provenance, content)` — validates and stores the `{ role, content, error }` chat envelope as JSON in `conversation_messages.content`, with the writing request's [content provenance](../../../../requirements/content/content-provenance.md)
- `createClientGeneratedChatTurn(params)` — atomically stores a native user/assistant pair under a conversation row lock, both messages recording `params.provenance`; an identical retry replays the stored pair and its original provenance (provenance is not part of the turn identity), and changed text or model or reused partial identity throws `ClientGeneratedTurnIdentityConflictError`
- `getConversationById(id)` / `getConversationByIdForMutation(id)` / `getConversationsByCreatedById(userId, options)` — conversation retrieval
- `getConversationMessagesByConversationId(conversationId)` — message list
- `currentUserCanViewConversation(currentUser, conversation)` / `currentUserCanUpdateConversation(...)` — authorization checks

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- Agents service: [../agents/README.md](../agents/README.md)
