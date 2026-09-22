# Customer Support reference

[Back to Customer Support](CUSTOMER-SUPPORT.md)

## Web Routes

### User-facing (authenticated)

| Route                                    | Description                              |
| ---------------------------------------- | ---------------------------------------- |
| `/chat/support`                          | List of user's own support threads       |
| `/chat/support/new`                      | New support request form                 |
| `/chat/support/new?conversation_id=<id>` | New request pre-linked to a conversation |
| `/chat/support/:threadId`                | View thread messages and status          |

### Admin (administrator role)

| Route                                       | Description                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/support` (admin layout)                   | Search threads by support contact email or subject, cursor-page results, and filter by status          |
| `/support/threads/:threadId` (admin layout) | Page history; assign, resolve/reopen, persist a manual reply, or run the draft approval/send lifecycle |
| `/support/contacts`                         | Search and cursor-page support contacts                                                                |
| `/support/contacts/:contactId`              | Read-only contact metadata and cursor-paged threads                                                    |

All support routes are `noindex, nofollow`.

The same four administrator-only surfaces are native in Swift and .NET. Member `/chat/support*`
routes remain separate and never expose staff queues or actions. “Save outbound reply” persists a
thread record and does not send email; only an approved draft's Send action invokes delivery.

API query, mutation, and polling details live in the
[Admin Support API README](../../../backend/api/v1/admin/support/README.md).

---
