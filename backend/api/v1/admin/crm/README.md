# Admin CRM API

Admin-only endpoints for managing CRM contacts, outreach emails, notes, and AI-generated email drafts.

All endpoints require administrator access (`currentUserCanManageCrm`).

## Endpoints

| Method | Route                                           | Description                               |
| ------ | ----------------------------------------------- | ----------------------------------------- |
| GET    | `/api/v1/crm/contacts`                          | Search/list CRM contacts                  |
| POST   | `/api/v1/crm/contacts`                          | Create a new CRM contact                  |
| GET    | `/api/v1/crm/contacts/:contactId`               | Get a single contact with social accounts |
| PATCH  | `/api/v1/crm/contacts/:contactId`               | Update a contact's fields                 |
| DELETE | `/api/v1/crm/contacts/:contactId`               | Archive a contact (soft delete)           |
| GET    | `/api/v1/crm/contacts/:contactId/emails`        | List email messages for a contact         |
| POST   | `/api/v1/crm/contacts/:contactId/emails`        | Send an outreach email to a contact       |
| PUT    | `/api/v1/crm/contacts/:contactId/user-link`     | Link contact to a user account            |
| DELETE | `/api/v1/crm/contacts/:contactId/user-link`     | Unlink contact from user account          |
| GET    | `/api/v1/crm/contacts/:contactId/notes`         | List notes for a contact                  |
| POST   | `/api/v1/crm/contacts/:contactId/notes`         | Create a note for a contact               |
| DELETE | `/api/v1/crm/contacts/:contactId/notes/:noteId` | Soft-delete a note                        |
| POST   | `/api/v1/crm/contacts/:contactId/email-drafts`  | Generate an AI-drafted outreach email     |

See [../imports/README.md](../imports/README.md) for the bulk CSV import endpoint.

## Performance

| Endpoint                                  | Round Trips | Caching      | Notes                                                            |
| ----------------------------------------- | ----------- | ------------ | ---------------------------------------------------------------- |
| GET /contacts                             | 2           | None         | Auth + paginated search (name cursor)                            |
| POST /contacts                            | 3           | None (write) | Auth, transaction (insert contact + social accounts), re-fetch   |
| GET /contacts/:contactId                  | 3           | None         | Auth + parallel: contact lookup + social accounts                |
| PATCH /contacts/:contactId                | 2           | None (write) | Auth, dynamic UPDATE                                             |
| DELETE /contacts/:contactId               | 2           | None (write) | Auth, soft-delete (archived_at)                                  |
| GET /contacts/:contactId/emails           | 2           | None         | Auth + paginated CRM email messages from conversations           |
| POST /contacts/:contactId/emails          | 3           | None (write) | Auth, create message, enqueue email (fire-and-forget)            |
| PUT /contacts/:contactId/user-link        | 3           | None (write) | Auth, UPDATE + re-fetch                                          |
| DELETE /contacts/:contactId/user-link     | 3           | None (write) | Auth, UPDATE + re-fetch                                          |
| GET /contacts/:contactId/notes            | 2           | None         | Auth + paginated notes                                           |
| POST /contacts/:contactId/notes           | 2           | None (write) | Auth, INSERT                                                     |
| DELETE /contacts/:contactId/notes/:noteId | 2           | None (write) | Auth, soft-delete (deleted_at)                                   |
| POST /contacts/:contactId/email-drafts    | 3+          | None         | Auth + parallel contact/social fetch, then AI agent (tool calls) |

## Related

- CRM contacts service: [../../../../services/crm-contacts/README.md](../../../../services/crm-contacts/README.md)
- CRM messages service: [`backend/services/crm-messages/`](../../../../services/crm-messages/)
- CRM notes service: [`backend/services/crm-notes/`](../../../../services/crm-notes/)
- CRM outreach agent: [../../../../agents/crm-outreach/README.md](../../../../agents/crm-outreach/README.md)
- Parent: [../README.md](../README.md)
