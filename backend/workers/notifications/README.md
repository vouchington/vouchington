# Notifications Worker

Worker package for notification reconciliation, delivery, and cleanup jobs.

Durable push-intent jobs lease their effect record, recheck eligibility, and persist endpoint-level
completion so a retry never resends an already delivered endpoint.

The processor claims with the push service's source-owned lease policy. During external delivery,
the service renews that exact pending claim and persists each endpoint result before finalizing or
releasing the intent. A lost claim stops the private provider agent and leaves recovery to reclaim
the durable intent.

Recovery scans use a fixed cursor snapshot. The worker enqueues each delivery before its next-page
continuation; the integration regression covers a 101-intent backlog and manually drains that
equal-priority FIFO order because the test queue shim does not schedule by priority.

## Exports

- `notificationsWorker` - worker instance for the `notifications` queue.

## Related

- Queue surface: [../../queues/notifications/README.md](../../queues/notifications/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
