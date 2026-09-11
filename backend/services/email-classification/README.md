# Email Classification Service

Single choke point for outbound email sends. Classifies every `EmailType` as `transactional` or
`marketing`, then applies the deliverability and compliance rules that classification implies:
SES configuration set selection, `List-Unsubscribe`/`List-Unsubscribe-Post` headers, and
marketing-only suppression checks (user preference opt-out, CRM contact opt-out, SES bounce
history).

Processors must call `sendClassifiedEmail` instead of importing `@modules/aws/ses` or
`@modules/gmail-smtp` directly — enforced by `no-direct-send.test.mts`, a grep-based test that
fails if any file outside `send.mts` imports `sendEmail`/`sendGmailEmail`.

## Registry

`EMAIL_CLASSIFICATIONS` (`registry.mts`) is a `Record<EmailType, EmailClassificationEntry>`:

- `{ classification: 'transactional' }` — no unsubscribe headers, uses
  `SES_CONFIGURATION_SET_TRANSACTIONAL`.
- `{ classification: 'marketing', unsubscribe, hasActiveSender }` — uses
  `SES_CONFIGURATION_SET_MARKETING`; `unsubscribe` is one of:
  - `{ scheme: 'user-category', category }` — per-user preference, `category` is one of
    `outcome_emails` | `news_digest` | `community_digest` (`@services/users`).
  - `{ scheme: 'crm-contact' }` — CRM recipient, keyed by email rather than a user account.
  - `hasActiveSender: false` marks a registry-only entry with no processor wired up yet (e.g.
    `newsDigest`, tracked by #1167/#1351).

`registry.test.mts` cross-checks the registry against every `processSend*Email` export under
`backend/workers/{emails,memberships}/processors` that imports `@email-templates/core`, so a new
processor without a registry entry fails CI.

## Functions

| Function                    | File            | Description                                                                                                                                                                                               |
| --------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sendClassifiedEmail`       | send.mts        | Looks up the registry entry, applies suppression checks for marketing email, then sends via SES or Gmail SMTP with the right headers/config set                                                           |
| `buildClassifiedSendParams` | send-params.mts | Pure function: `EmailType` + `{ userId?, crmEmail? }` → `{ headers?, configurationSetName? }`; throws `TypeError` if a marketing type is called without the context field its unsubscribe scheme requires |

## Suppression Checks (marketing only)

`sendClassifiedEmail` returns `null` without sending when, in order:

1. `unsubscribe.scheme === 'user-category'` and the user has opted out of that category
   (`getEmailPreferences`, `@services/users`).
2. `unsubscribe.scheme === 'crm-contact'` and the CRM contact has `opted_out_at` set
   (`getCrmContactByEmail`, `@services/crm-contacts`).
3. The recipient address has a permanent SES bounce or complaint on file
   (`isEmailSuppressed`, `@services/ses-bounce-events`).

Transactional email skips all three checks — it is never suppressed by marketing preferences.

## Unsubscribe Headers

Headers are built per-scheme and point at different endpoints:

- `user-category` → `createListUnsubscribeHeaders(userId, category)` (`@services/users`) →
  `/api/v1/email-unsubscribe?token=...`.
- `crm-contact` → `createCrmListUnsubscribeHeaders(email)` (`@services/crm-contacts`) →
  `/api/v1/crm/unsubscribe?token=...`. The endpoint (`backend/api/v1/crm/unsubscribe.mts`) and
  landing page (`web/app/crm/unsubscribe/`) are documented in
  [../crm-contacts/README.md](../crm-contacts/README.md).

## Related

- Processors that call `sendClassifiedEmail`: [../../workers/emails/README.md](../../workers/emails/README.md), [../../workers/memberships/README.md](../../workers/memberships/README.md)
- CRM contact opt-out state: [../crm-contacts/README.md](../crm-contacts/README.md)
- User notification/email preferences: [../users/README.md](../users/README.md)
- SES send + config sets: [../../modules/aws/README.md](../../modules/aws/README.md)
