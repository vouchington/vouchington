# Email System

Source entrypoint: [backend/queues/emails/README.md](../../../../../backend/queues/emails/README.md)

This system handles asynchronous email sending through a job queue.
All emails should flow through this queue for reliability and for metrics (e.g. how many of each get sent).

## Queue Configuration

### Queues

- `emails` - Sends transactional emails
  - Concurrency: Configurable per worker
  - Each job processes one email recipient
  - Dispatcher jobs fan out engagement onboarding and moderation summary sends
  - `processSendCopyrightNoticeEmail` resolves a claimed legal-delivery intent at send time; no
    recipient address or legal body is carried in the queue payload.
  - Jobs may carry an optional `uiLocale`; processors render Voucha-authored copy in `en`, `es`, `fr`, or `pt`, falling back to English.
  - Template send jobs set no custom `jobId` and no deduplication, only a priority.
  - The worker rejects a job whose name and payload do not match that job's enqueue contract before the processor runs.

### Credential-bearing jobs

`processSendEmailAddressLoginToken`, `processSendEmailVerificationToken`,
`processSendCommunityInviteEmail`, and `processSendDataExportReadyEmail` (`SECRET_BEARING_EMAIL_JOBS`
in `backend/queues/emails/enqueues/job-options.mts`) carry a value the recipient redeems: a login
token, a verification code, an invite code, or a 7-day presigned download URL. The login token is
stored hashed, so the raw value can only travel in the payload. These jobs set
`removeOnComplete: true` and `removeOnFail: true`, so no copy stays in Valkey after the job finishes
instead of sitting in the default 100-deep retained history. A terminal failure is still reported
through `onError` from the worker's in-process `failed` event, with `scrubJobData` redacting
`token`, `code`, and URL values from that report. The dev-only verbose worker logger still prints
raw job data on a developer machine.

The payload remains in Valkey while the job is waiting, active, or backing off for a retry, and a job
that stalls past its limit is moved to the failed set without honoring `removeOnFail`. Closing those
windows needs worker-side handling or a payload that carries an id the processor resolves at send
time. Every other email job keeps the default retention.

### Testing

- Tests enqueue jobs and run processors under their owning test fixtures; enqueue admission does not synchronously process an email.
- No external email service calls in tests (mocked)

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- [Notifications Service](../../services/notifications/README.md)
- [SES Bounce Events Service](../../services/ses-bounce-events/README.md)

## API-key expiry reminders

The hourly `dispatchApiKeyExpiryReminders` job queues bounded pages of
`processSendApiKeyExpiryReminder` jobs carrying only an API-key id. The service's durable claim
prevents duplicate sending after queue retries or deduplication expiry. See the
[API-key lifecycle](../../../../requirements/users/reference-api-key-lifecycle.md) and its
[durable transition matrix](../../services/api-keys/README.md#expiry-reminders).
