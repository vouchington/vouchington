# `crm_contact`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action        | Description                                                                                               | Route             | File path                                | Navigation path(s)               |
| ------------- | --------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------- | -------------------------------- |
| List / Filter | Browse CRM contacts; filter by status, vertical, and linked-user status.                                  | `/crm`            | `web/app/(crm)/crm/page.tsx`             | sidebar: CRM → CRM; command: CRM |
| CSV Import    | Import contacts from a CSV file via the import dialog.                                                    | `/crm`            | `web/app/(crm)/crm/page.tsx`             | sidebar: CRM → CRM; command: CRM |
| Edit Contact  | Edit contact info, send or AI-draft emails, view message history, manage notes, link/unlink user account. | `/crm/:contactId` | `web/app/(crm)/crm/[contactId]/page.tsx` | inline: from `/crm` row          |
