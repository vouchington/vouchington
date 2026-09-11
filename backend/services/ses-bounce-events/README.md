# @services/ses-bounce-events

Records and retrieves AWS SES bounce, complaint, and delivery notification events for email deliverability tracking.

## Key exports

- `createSesBounceEvent(input: CreateSesBounceEventInput)` — records a new bounce, complaint, or
  delivery event; returns `null` instead of inserting when `dedup_key` (derived from
  `ses_message_id` + `notification_type` + `ses_timestamp` + the sorted, normalized recipient list)
  already exists, so at-least-once redelivery (a retried Lambda invocation today, an SQS consumer
  once Phase 3b lands) is a safe no-op rather than a duplicate row — while distinct per-recipient
  notifications that share a `mail.messageId` and timestamp still get their own row
- `isEmailSuppressed(email)` — checks if an email address is suppressed (permanently bounced or complained)
- `SesNotificationType` — `'bounce' | 'complaint' | 'delivery'`
- `SesBounceType` — `'permanent' | 'transient' | 'undetermined'`
- `SesBounceEvent` — the full event record type

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- AWS module: [../../modules/aws/README.md](../../modules/aws/README.md)
