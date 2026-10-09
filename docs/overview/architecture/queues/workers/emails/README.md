# Emails Worker

Source entrypoint: [backend/workers/emails/README.md](../../../../../../backend/workers/emails/README.md)

Worker package for transactional email delivery jobs and email dispatcher jobs.

## Exports

- `emails` - worker instance for the `emails` queue. It routes both `processSend*Email`
  jobs and the dispatcher jobs that enqueue engagement and moderation summary emails.
  `processSendCopyrightNoticeEmail` sends only immutable correspondence through the transactional
  SES configuration set, then records SES MessageId and correspondence acceptance.
  A mismatched job name or payload fails before the template, copyright, or dispatcher function runs.

SES reports `Throttling` ("Maximum sending rate exceeded", or the daily quota) as HTTP 400. The
transactional processors send through `.catch(wrapHttpForRetry)`, which used to drop every 4xx as
permanent and so lost the email. It now recognizes AWS throttling and rethrows it, so GlideMQ retries
the job under its three attempts and exponential backoff. SES rejects a throttled request before
sending, and the SES client keeps `maxAttempts: 1` (a send has no idempotency token), so the retry
cannot duplicate an email. Any other SES 400 (`MessageRejected`, an unverified address) still ends the
job as unrecoverable.

## Related

- Queue surface: [../../queues/emails/README.md](../../emails/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
