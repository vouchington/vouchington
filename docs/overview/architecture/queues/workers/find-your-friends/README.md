# Find Your Friends Worker

Source entrypoint: [backend/workers/find-your-friends/README.md](../../../../../../backend/workers/find-your-friends/README.md)

Worker package for social graph sync and find-your-friends dispatch jobs.

## Exports

- `findYourFriends` - worker instance for the `find-your-friends` queue.

A 429 from X, Facebook, or GitHub during a sync is no longer rewrapped as a 502 that burns the job's
three attempts on a 5-second backoff. The sync services throw GlideMQ's rate-limit signal carrying the
response's `Retry-After` (a minute when it names none, clamped to 1 second through 15 minutes), so the
job is requeued after that wait without consuming an attempt. The signal's `cause` is an
`HttpRateLimitError` with the 429 status and `retryAfterMs`. Other non-OK responses stay 502 under the
queue attempts. The signal is raised in `@services/oauth-{x,facebook,github}/friends.mts` because the
worker routes jobs straight to those services. X also reports its reset in `x-rate-limit-reset` and
GitHub sometimes signals a limit with 403, neither of which is read yet.

## Related

- Queue surface: [../../queues/find-your-friends/README.md](../../find-your-friends/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
