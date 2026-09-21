# @services/crm-notes

CRUD operations for internal CRM notes backed by `conversation_messages` rows in CRM conversations.

## Key exports

- `createCrmNote(currentUser, input)` — creates a new internal note for a CRM contact
- `getCrmNotesByContactId(contactId, options)` — paginated contact notes
- `deleteCrmNote(currentUser, contactId, noteId)` — soft-deletes a note

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- CRM messages: [../crm-messages/README.md](../crm-messages/README.md)
