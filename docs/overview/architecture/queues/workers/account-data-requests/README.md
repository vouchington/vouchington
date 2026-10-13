# Account Data Requests Worker

Source entrypoint: [backend/workers/account-data-requests/README.md](../../../../../../backend/workers/account-data-requests/README.md)

Worker package for account data export and expired export cleanup jobs.

## Exports

- `accountDataRequests` - worker instance for the `account-data-requests` queue.
- Processing is fenced by the persisted attempt UUID and the active-user lifecycle lock; the
  recovery dispatcher reclaims only active users' stale work.
- Recovery keeps an unstarted attempt's token and removes any completed or failed queue record under
  its job ID before dispatching the attempt again, so a job that failed or stalled before
  `markDataRequestProcessing` claimed the token is re-run by the next recovery pass.
- S3 uploads acquire a bounded database lease immediately before the provider call and abort before
  the lease deadline. Account deletion cannot consume that attempt key until the lease closes.

## Related

- Queue surface: [../../queues/account-data-requests/README.md](../../account-data-requests/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
