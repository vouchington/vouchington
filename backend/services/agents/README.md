# @services/agents

CRUD, search, authorization, and prompt management for AI agents, including conversation tracking.

## Key exports

- `createSystemAgent(params)` — creates a new system agent
- `getAgentByAny(idOrSlug)` / `getAgentBySystemUserId(systemUserId)` — retrieves an agent by slug/ID or system user ID
- `searchAgents(options?)` — paginated agent search
- `currentUserCanViewAgents(currentUser)` — authorization check
- `searchAgentConversations(systemUserId, options?)` — lists conversations for an agent user

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Conversations: [../conversations-messages/README.md](../conversations-messages/README.md)
