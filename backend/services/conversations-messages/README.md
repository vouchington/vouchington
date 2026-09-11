# @services/conversations-messages

Manages AI agent conversation messages, agentic run tracking, and streaming run event writes.

List reads use the repository's [cursor pagination contract](../../../docs/overview/architecture/pagination.md).
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
- `createConversationMessage(params)` — adds a message to a conversation
- `createConversationMessageAgenticRun(params)` — records a new agentic run for a message
- `createRunEventWriter(agenticRunId)` — returns a writer function for streaming run events
- `getConversationById(id)` / `getConversationByIdForMutation(id)` / `getConversationsByCreatedById(userId, options)` — conversation retrieval
- `getConversationMessagesByConversationId(conversationId)` — message list
- `getConversationMessageAgenticRunById(id)` — agentic run retrieval with status derived from lifecycle timestamps
- `currentUserCanViewConversation(currentUser, conversation)` / `currentUserCanUpdateConversation(...)` — authorization checks

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Agents service: [../agents/README.md](../agents/README.md)
