# Account Data Requests Worker

Source entrypoint: [backend/workers/account-data-requests/README.md](../../../../../../backend/workers/account-data-requests/README.md)

Worker package for account data export and expired export cleanup jobs.

## Exports

- `accountDataRequests` - worker instance for the `account-data-requests` queue.
- Processing is fenced by the persisted attempt UUID and the active-user lifecycle lock; the
  recovery dispatcher reclaims only active users' stale work.
- S3 uploads acquire a bounded database lease immediately before the provider call and abort before
  the lease deadline. Account deletion cannot consume that attempt key until the lease closes.

## Related

- Queue surface: [../../queues/account-data-requests/README.md](../../account-data-requests/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
