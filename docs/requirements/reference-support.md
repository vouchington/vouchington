# Support

[Back to Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md#support)

| Entity           | Flow                 | Authorization | Page/Route            | Component (file:line)                                                                   | Notes                                                                                              |
| ---------------- | -------------------- | ------------- | --------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `support_thread` | Create               | Signed-in     | `/chat/support/new`   | `web/app/(chat)/chat/support/new/page.tsx`                                              |                                                                                                    |
| `support_thread` | Reply                | Admin         | `/support/[threadId]` | `web/app/(support-admin)/support/threads/[threadId]/admin-support-reply-composer.tsx`   | User `/chat/support/[threadId]` is read-only; only admins can send replies. Auth: `isOwnerOrAdmin` |
| `support_thread` | Admin edit / resolve | Admin         | `/support/[threadId]` | `web/app/(support-admin)/support/threads/[threadId]/admin-support-message-card.tsx:147` | Approve agent draft, send manual reply, mark resolved                                              |
| `support_thread` | Delete conversation  | Self          | `/chat` sidebar       | `web/lib/api/client/conversations.ts` (`deleteConversation`)                            |                                                                                                    |
