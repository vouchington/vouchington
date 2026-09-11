# Admin Support API

Admin endpoints for managing customer support threads, messages, and contacts.

All endpoints require the `administrator` role. Returns 401 for unauthenticated requests and 403 for non-admin users.

## Endpoints

### Threads

| Method | Route                               | Description                         |
| ------ | ----------------------------------- | ----------------------------------- |
| GET    | `/api/v1/support/threads`           | List/search support threads         |
| GET    | `/api/v1/support/threads/:threadId` | Get thread detail                   |
| PATCH  | `/api/v1/support/threads/:threadId` | Assign, resolve, or reopen a thread |

### Messages

| Method | Route                                                             | Description                        |
| ------ | ----------------------------------------------------------------- | ---------------------------------- |
| GET    | `/api/v1/support/threads/:threadId/messages`                      | List messages for a thread         |
| POST   | `/api/v1/support/threads/:threadId/messages`                      | Create a manual outbound message   |
| POST   | `/api/v1/support/threads/:threadId/drafts`                        | Trigger AI draft generation (202)  |
| PATCH  | `/api/v1/support/threads/:threadId/messages/:messageId`           | Edit a draft message body          |
| POST   | `/api/v1/support/threads/:threadId/messages/:messageId/approvals` | Approve a draft message            |
| POST   | `/api/v1/support/threads/:threadId/messages/:messageId/sends`     | Send an approved message via email |

### Contacts

| Method | Route                                 | Description                  |
| ------ | ------------------------------------- | ---------------------------- |
| GET    | `/api/v1/support/contacts`            | List/search support contacts |
| GET    | `/api/v1/support/contacts/:contactId` | Get contact detail           |
| PATCH  | `/api/v1/support/contacts/:contactId` | Update contact name or notes |

## Thread PATCH Body

The `PATCH /api/v1/support/threads/:threadId` endpoint accepts one of:

- `{ "assigned_to_id": "<authenticated administrator UUID>" }` — assign the thread to the authenticated administrator only; aliases and other administrator IDs are rejected
- `{ "resolved": true }` — mark thread resolved (current user is resolver)
- `{ "resolved": false }` — reopen a resolved thread

List endpoints accept opaque `after` cursors and bounded `limit` values. Thread and contact lists
also accept `q`; thread-list `q` matches the support contact email address or thread subject, while
contact-list `q` matches the contact email or name. Thread lists accept `status=open|assigned|resolved`.
Unresolved thread lists put active or past-due Pro members ahead of Plus members, then Free
standard support, with recency as the tie-breaker. This is staff inbox ordering only. It neither
sets a response-time SLA nor changes AI queue priority, and the service level is not returned by
the API. Thread cursors bind the normalized `q`, `status`, and versioned inbox ordering; malformed,
legacy, or mismatched continuations return `400`. A cursor preserves the captured rank of its final
row, while page-one refresh reconciles other rows whose mutable status or membership rank changes
during traversal.
Message pages are returned newest first, so clients prepend older pages when presenting chronological
history.

`POST /messages` records a manual outbound reply in the thread only. It does not email the contact.
Email delivery is a separate, explicit operation: edit an AI draft, approve it, then invoke its
`/sends` endpoint. Draft creation requires an inbound message to ground the response. Subject-only
threads return `422` with `SUPPORT_THREAD_INBOUND_MESSAGE_REQUIRED`; clients must hide draft
generation until an inbound message is present. Eligible draft creation returns `202`; clients poll
the message list until the new draft appears, with a bounded timeout and retry state.

Contact PATCH accepts only `name` and `notes`. Current staff clients expose contact detail as
read-only while retaining this typed API contract.

## Auth Requirements

All endpoints require `currentUserCanManageSupport` (administrator role).

## Performance

| Endpoint                                                             | Round Trips | Caching      | Notes                                         |
| -------------------------------------------------------------------- | ----------- | ------------ | --------------------------------------------- |
| GET /api/v1/support/threads                                          | 2           | None         | Auth + paginated search with optional filters |
| GET /api/v1/support/threads/:threadId                                | 2           | None         | Auth + single thread lookup                   |
| PATCH /api/v1/support/threads/:threadId                              | 4           | None (write) | Auth + fetch + update + re-fetch              |
| GET /api/v1/support/threads/:threadId/messages                       | 3           | None         | Auth + thread check + paginated messages      |
| POST /api/v1/support/threads/:threadId/messages                      | 3           | None (write) | Auth + thread check + insert                  |
| POST /api/v1/support/threads/:threadId/drafts                        | 2           | None         | Auth + thread check + enqueue                 |
| PATCH /api/v1/support/threads/:threadId/messages/:messageId          | 3           | None (write) | Auth + thread check + update                  |
| POST /api/v1/support/threads/:threadId/messages/:messageId/approvals | 4           | None (write) | Auth + thread check + message check + approve |
| POST /api/v1/support/threads/:threadId/messages/:messageId/sends     | 4           | None (write) | Auth + thread check + send (email) + re-fetch |
| GET /api/v1/support/contacts                                         | 2           | None         | Auth + paginated search                       |
| GET /api/v1/support/contacts/:contactId                              | 2           | None         | Auth + single contact lookup                  |
| PATCH /api/v1/support/contacts/:contactId                            | 3           | None (write) | Auth + fetch + update                         |

## Related

- Customer support service: [../../../../services/customer-support/](../../../../services/customer-support/)
- Parent admin API: [../README.md](../README.md)
- Staff route requirements: [../../../../../docs/requirements/admin/reference-customer-support-web-routes.md](../../../../../docs/requirements/admin/reference-customer-support-web-routes.md)
