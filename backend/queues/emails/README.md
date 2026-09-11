# Email System

This system handles asynchronous email sending through a job queue.
All emails should flow through this queue for reliability and for metrics (e.g. how many of each get sent).

## Queue Configuration

### Queues

- `emails` - Sends transactional emails
  - Concurrency: Configurable per worker
  - Each job processes one email recipient
  - Dispatcher jobs fan out engagement onboarding and moderation summary sends
  - Jobs may carry an optional `uiLocale`; processors render Voucha-authored copy in `en`, `es`, `fr`, or `pt`, falling back to English.
  - JobId format: `email:{type}:{recipient}:{timestamp}` for deduplication

### Testing

- Uses `BULLMQ_INLINE_MODE` in tests for synchronous processing
- No external email service calls in tests (mocked)

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- [Notifications Service](../../services/notifications/README.md)
- [SES Bounce Events Service](../../services/ses-bounce-events/README.md)
