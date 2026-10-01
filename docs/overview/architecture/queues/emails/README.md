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
  - JobId format: `email:{type}:{recipient}:{timestamp}` for deduplication
  - The worker rejects a job whose name and payload do not match that job's enqueue contract before the processor runs.

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
