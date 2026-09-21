# @services/crm-messages

CRM email management backed by `conversation_messages` rows in CRM conversations.

## Key exports

- `sendCrmEmail(currentUser, contactId, input)` — creates/reuses the contact's CRM conversation, stores an outbound email message, enqueues delivery, and marks the contact contacted
- `createCrmMessage(input)` — low-level helper for inserting CRM email rows into `conversation_messages`
- `getCrmMessagesByContactId(contactId, options)` — paginated contact email history
- `getCrmMessagesByConversationId(conversationId, options)` — paginated email history for a CRM conversation

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- CRM notes: [../crm-notes/README.md](../crm-notes/README.md)
