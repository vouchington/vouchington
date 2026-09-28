# Emails Worker

Source entrypoint: [backend/workers/emails/README.md](../../../../../../backend/workers/emails/README.md)

Worker package for transactional email delivery jobs and email dispatcher jobs.

## Exports

- `emails` - worker instance for the `emails` queue. It routes both `processSend*Email`
  jobs and the dispatcher jobs that enqueue engagement and moderation summary emails.
  `processSendCopyrightNoticeEmail` sends only immutable correspondence through the transactional
  SES configuration set, then records SES MessageId and correspondence acceptance.
  A mismatched job name or payload fails before the template, copyright, or dispatcher function runs.

## Related

- Queue surface: [../../queues/emails/README.md](../../emails/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
