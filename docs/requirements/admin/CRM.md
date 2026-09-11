# CRM (Contact Relationship Management)

Internal admin tool for managing influencer outreach and contact relationships.

## Overview

The CRM system enables admins to:

- Import contacts via CSV or create them manually
- Send personalized outreach emails via SES or Gmail SMTP
- Use AI to draft context-aware emails based on the contact's vertical and platform content
- Track communication status through lifecycle timestamps
- Link CRM contacts to local user accounts upon conversion
- Add internal notes to contacts

## Contact Model

### Contact Types

- `influencer` (default) — content creators for outreach
- `customer` — future: customer support
- `partner` — future: partnership management

### Verticals

`credit_cards`, `travel`, `cars`, `ai`, `technology`, `finance`, `lifestyle`, `other`

### Sources

`csv_import`, `manual`, `inbound_email`, `referral`

### Status (Derived from Timestamps)

Status is **never stored as a column**. Lifecycle actions are recorded in
`crm_contact_lifecycle_changes`; `crm_contacts` keeps current timestamp snapshots for filtering and
display. Status is derived from those lifecycle timestamps in priority order:

| Priority | Condition          | Status            |
| -------- | ------------------ | ----------------- |
| 1        | `opted_out_at` set | opted_out         |
| 2        | `archived_at` set  | archived          |
| 3        | `converted_at` set | converted         |
| 4        | `responded_at` set | in_conversation   |
| 5        | `contacted_at` set | awaiting_response |
| 6        | none set           | new               |

## Self-Service Unsubscribe

Recipients can opt themselves out without admin action — distinct from an admin manually setting
`opted_out_at`. Every outreach email carries an RFC 8058 one-click `List-Unsubscribe` header and a
visible footer link (both point at an email-keyed, encrypted token, so opt-out survives CSV
re-import even before the contact is linked to a user account). The public, unauthenticated
`POST /api/v1/crm/unsubscribe` endpoint and `/crm/unsubscribe` landing page silently no-op on an
unknown or already-opted-out email — the response never reveals whether an address is a CRM
contact. A self-service opt-out records the same `mark_opted_out` lifecycle row and derived
`opted_out` status as an admin-set one, with `changed_by_id` left `null` to distinguish the two in
history. Once opted out, `sendCrmEmail` rejects new sends to that contact (422) before enqueueing,
independent of admin action. Details: [CRM contacts service § Self-Service Unsubscribe](../../../backend/services/crm-contacts/README.md#self-service-unsubscribe).

## CSV Import Format

Required columns: `name`, `email`

Optional columns: `phone`, `vertical`, `follower_count`, `instagram`, `tiktok`, `youtube`, `x`, `linkedin`, `notes`

- Duplicate emails within a batch are rejected
- Re-importing an existing email updates the contact (upsert by email)
- Email is normalized to lowercase
- Follower count must be a non-negative integer

## Email Providers

### SES (Amazon Simple Email Service)

- Used for automated/bulk outreach
- Tracks delivery status (`sent_at`, `delivered_at`, `bounced_at`)

### Gmail SMTP

- Used for personalized 1:1 outreach
- Appears as sent from admin's Gmail address
- Uses app password authentication

## AI Email Drafting

The CRM outreach agent generates personalized email drafts using:

- Contact context (name, vertical, follower count, social handles)
- Platform content search (posts and RSS feed articles relevant to the contact's vertical)
- Optional admin prompt and tone guidance

The agent is synchronous — the admin sees the draft immediately for editing before sending.

## Account Linking

Admins can link a CRM contact to a local user account. Linking:

- Sets `user_id` on the contact
- Sets `converted_at` timestamp (moves status to "converted")

Unlinking clears both fields.

## Database Tables

- `crm_contacts` — core contact record
- `crm_contact_lifecycle_changes` — append-only contact lifecycle transition history
- `crm_contact_social_accounts` — per-platform social handles
- `conversations` — CRM outreach timeline (`channel_type = 'crm'`)
- `conversation_participants` — links the CRM contact and admin participants
- `conversation_messages` — outreach emails and internal notes

## Admin Pages

- `/crm` — contacts list with search, status/vertical filters, CSV import
- `/crm/:contactId` — contact detail with email history, notes, compose/AI draft dialogs

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- API reference: [../../backend/api/v1/admin/crm/README.md](../../../backend/api/v1/admin/crm/README.md)
- CRM contacts service: [../../backend/services/crm-contacts/README.md](../../../backend/services/crm-contacts/README.md)
- CRM outreach agent: [../../backend/agents/crm-outreach/README.md](../../../backend/agents/crm-outreach/README.md)
- Schema: [../../backend/data-stores/psql/README.md](../../../backend/data-stores/psql/README.md)
