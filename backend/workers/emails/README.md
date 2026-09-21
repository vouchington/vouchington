# Emails Worker

Worker package for transactional email delivery jobs and email dispatcher jobs.

## Exports

- `emails` - worker instance for the `emails` queue. It routes both `processSend*Email`
  jobs and the dispatcher jobs that enqueue engagement and moderation summary emails.
  `processSendCopyrightNoticeEmail` sends only immutable correspondence through the transactional
  SES configuration set, then records SES MessageId and correspondence acceptance.

## Related

- Queue surface: [../../queues/emails/README.md](../../queues/emails/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
