# `support_contact`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action        | Description                                                            | Route                          | File path                                            | Navigation path(s)                                         |
| ------------- | ---------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------- |
| List Contacts | Search and cursor-page all support contacts.                           | `/support/contacts`            | Web and native staff-support contact surfaces        | sidebar: CRM → Support Contacts; command: Support Contacts |
| View Contact  | View read-only contact metadata and cursor-page their support threads. | `/support/contacts/:contactId` | Web and native staff-support contact detail surfaces | inline: from `/support/contacts` row                       |
