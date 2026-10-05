# @services/agents

Source entrypoint: [backend/services/agents/README.md](../../../../../backend/services/agents/README.md)

CRUD and prompt management for retained AI agents.

## Key exports

- `createSystemAgent(params)` — creates a new system agent
- `getAgentBySystemUserId(systemUserId)` — retrieves an agent by system user ID
- `getActiveAgentsByType(agentType)` — lists activated, non-deactivated agents of one type
- `getAgentModeratorConfig(agentId)` — reads retained moderator identity metadata; may be removed after intended-use review because production use is unconfirmed

`getActiveAgentsByType` is retained provisionally under issue #1360. Production use is unconfirmed,
and the export may be removed after intended-use review.

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- Conversations: [../conversations-messages/README.md](../conversations-messages/README.md)
