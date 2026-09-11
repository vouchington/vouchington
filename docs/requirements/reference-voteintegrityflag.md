# `vote_integrity_flag`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action             | Description                                                    | Route                   | File path                                                | Navigation path(s)                                             |
| ------------------ | -------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| List / Filter      | Browse vote integrity flags with cursor-based infinite scroll. | `/vote-integrity/flags` | `web/app/(vote-integrity)/vote-integrity/flags/page.tsx` | sidebar: Engineering → Vote Integrity; command: Vote Integrity |
| Dismiss            | Dismiss a flag as not suspicious.                              | `/vote-integrity/flags` | `web/app/(vote-integrity)/vote-integrity/flags/page.tsx` | sidebar: Engineering → Vote Integrity; command: Vote Integrity |
| Penalize           | Apply a score penalty to the flagged user.                     | `/vote-integrity/flags` | `web/app/(vote-integrity)/vote-integrity/flags/page.tsx` | sidebar: Engineering → Vote Integrity; command: Vote Integrity |
| Suspend            | Suspend the flagged user's account.                            | `/vote-integrity/flags` | `web/app/(vote-integrity)/vote-integrity/flags/page.tsx` | sidebar: Engineering → Vote Integrity; command: Vote Integrity |
| Apply Ring Penalty | Apply a ring penalty affecting the flagged voting ring.        | `/vote-integrity/flags` | `web/app/(vote-integrity)/vote-integrity/flags/page.tsx` | sidebar: Engineering → Vote Integrity; command: Vote Integrity |
