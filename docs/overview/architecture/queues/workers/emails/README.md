# Emails Worker

Source entrypoint: [backend/workers/emails/README.md](../../../../../../backend/workers/emails/README.md)

Worker package for event-triggered transactional email delivery jobs. Digest dispatchers and their sends run in the [email-digests worker](../email-digests/README.md).

## Exports

- `emails` - worker instance for the `emails` queue. It routes the event-triggered `processSend*Email`
  jobs.
  `processSendCopyrightNoticeEmail` sends only immutable correspondence through the transactional
  SES configuration set, then records SES MessageId and correspondence acceptance.
  A mismatched job name or payload fails before the template or copyright function runs.

SES reports `Throttling` ("Maximum sending rate exceeded", or the daily quota) as HTTP 400. The five
community and welcome processors send through `.catch(wrapHttpForRetry)`, which used to drop every 4xx as
permanent and so lost the email. It now recognizes AWS throttling and rethrows it, so GlideMQ retries the
job under its three attempts and exponential backoff. The other processors let the raw SES error
propagate, which GlideMQ already retried. SES rejects a throttled request before sending, and the SES
client keeps `maxAttempts: 1` (a send has no idempotency token), so the retry cannot duplicate an
email. Any other SES 400 (`MessageRejected`, an unverified address) still ends the wrapped job as
unrecoverable.

## Related

- Queue surface: [../../queues/emails/README.md](../../emails/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
