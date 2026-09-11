# `support_thread`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action        | Description                                                                                                                                 | Route                        | File path                                                                                    | Navigation path(s)                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| List / Filter | Search and cursor-page support threads; filter by status (open/assigned/resolved).                                                          | `/support`                   | `web/app/(support-admin)/support/page.tsx`; native staff-support surfaces                    | sidebar: CRM → Support; command: Support |
| View Thread   | Page messages; open threads can assign to self, resolve, reply, or request one AI draft. Resolved threads must reopen before outbound work. | `/support/threads/:threadId` | `web/app/(support-admin)/support/threads/[threadId]/page.tsx`; native staff-support surfaces | inline: from `/support` row              |
