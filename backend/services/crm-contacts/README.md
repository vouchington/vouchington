# CRM Contacts Service

Manages CRM contact records, social accounts, and lifecycle operations.

## Tables Owned

- `crm_contacts` — core contact record with denormalized current lifecycle timestamps
- `crm_contact_lifecycle_changes` — append-only lifecycle transition history
- `crm_contact_social_accounts` — per-platform social handles

## Contact Lifecycle

Status is derived from lifecycle timestamps (never stored as a column). Lifecycle actions write an
append-only `crm_contact_lifecycle_changes` row and update the current timestamp snapshot on
`crm_contacts` for filtering and display.

| Priority | Timestamp      | Derived Status    |
| -------- | -------------- | ----------------- |
| 1        | `opted_out_at` | opted_out         |
| 2        | `archived_at`  | archived          |
| 3        | `converted_at` | converted         |
| 4        | `responded_at` | in_conversation   |
| 5        | `contacted_at` | awaiting_response |
| 6        | (none set)     | new               |

## Functions

| Function                      | File          | Description                                                                                                      |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createCrmContact`            | create.mts    | Creates contact + optional social accounts                                                                       |
| `getCrmContact`               | get.mts       | Single contact by ID                                                                                             |
| `getCrmContactByEmail`        | get.mts       | Lookup by email (case-insensitive, non-archived)                                                                 |
| `getCrmContactSocialAccounts` | get.mts       | Social accounts for a contact                                                                                    |
| `updateCrmContact`            | update.mts    | Partial update of contact fields                                                                                 |
| `archiveCrmContact`           | delete.mts    | Sets `archived_at` (soft delete)                                                                                 |
| `searchCrmContacts`           | search.mts    | Paginated search with status/vertical/text filters                                                               |
| `linkCrmContactToUser`        | link-user.mts | Links contact to a user account, sets `converted_at`                                                             |
| `unlinkCrmContactFromUser`    | link-user.mts | Removes user link, clears `converted_at`                                                                         |
| `optOutCrmContactByEmail`     | opt-out.mts   | Idempotent, email-keyed opt-out; sets `opted_out_at` + `mark_opted_out` lifecycle row with `changed_by_id: null` |

## Self-Service Unsubscribe

Recipient-driven opt-out, distinct from an admin manually editing contact status. Email-keyed
(not user-keyed) so it survives CSV re-import.

| Function                          | File            | Description                                                                       |
| --------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| `createCrmUnsubscribeToken`       | unsubscribe.mts | Encrypts `{email}` via `@modules/token-secrets` (purpose `crm-unsubscribe-token`) |
| `createCrmUnsubscribeUrl`         | unsubscribe.mts | Human landing page URL: `/crm/unsubscribe?token=...`                              |
| `createCrmListUnsubscribeHeaders` | unsubscribe.mts | RFC 8058 one-click headers pointing at `/api/v1/crm/unsubscribe?token=...`        |
| `unsubscribeCrmContactByToken`    | unsubscribe.mts | Decrypts the token and calls `optOutCrmContactByEmail`                            |

Public endpoint: `POST /api/v1/crm/unsubscribe` ([../../api/v1/crm/README.md](../../api/v1/crm/README.md)),
no auth required, silently no-ops on an unknown or already-opted-out email (privacy-preserving —
never reveals whether an address is a CRM contact). Landing page: `web/app/crm/unsubscribe/`.

Enforced at send time in two places: `sendCrmEmail` (`@services/crm-messages`) asserts
`!contact.opted_out_at` before enqueueing (422 if opted out), and `sendClassifiedEmail`
(`@services/email-classification`) re-checks after dequeue so the gmail-SMTP path and the
enqueue→process gap are both covered.

## Search Performance

Contact listing uses `(name, id)` keyset pagination. Text search on `name` and
`email` uses trigram indexes for substring matching.

## Authorization

All mutations require admin access via `currentUserCanManageCrm(currentUser)`.

## Related

- Admin API routes: [../../api/v1/admin/crm/README.md](../../api/v1/admin/crm/README.md)
- Public unsubscribe API route: [../../api/v1/crm/README.md](../../api/v1/crm/README.md)
- Email classification / send orchestrator: [../email-classification/README.md](../email-classification/README.md)
- CRM messages: [../crm-messages/](../crm-messages/README.md)
- CRM notes: [../crm-notes/](../crm-notes/README.md)
- Schema: [../../data-stores/psql/README.md](../../data-stores/psql/README.md)
