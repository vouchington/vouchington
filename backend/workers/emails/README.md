# Emails Worker

Worker package for transactional email delivery jobs and email dispatcher jobs.

## Exports

- `emails` - worker instance for the `emails` queue. It routes both `processSend*Email`
  jobs and the dispatcher jobs that enqueue engagement and moderation summary emails.

## Related

- Queue surface: [../../queues/emails/README.md](../../queues/emails/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
