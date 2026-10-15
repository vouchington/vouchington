# Find Your Friends System

Source entrypoint: [backend/queues/find-your-friends/README.md](../../../../../backend/queues/find-your-friends/README.md)

Syncs social connections from Facebook, X, and GitHub to discover existing platform users.

## Queue Configuration

### `find-your-friends`

Domain `find-your-friends` of the shared [`background` queue](../background/README.md); job names are
`find-your-friends.<name>`. The domain has no domain-wide cap: each provider sync runs in its own
namespaced ordering lane `find-your-friends:sync_<provider>` with that provider's concurrency and
rate limit, and the dispatchers have no lane. It adds a worker baseline of five.
`WORKER_CONCURRENCY_FIND_YOUR_FRIENDS` no longer exists.

- `find-your-friends.enqueueDispatchFindYourFriends` — daily scheduler producer that coalesces one live sweep (priority 100)
- `find-your-friends.dispatchFindYourFriends` — retained dispatcher that enqueues social sync jobs for all OAuth providers linked to a user (priority 100)
- `find-your-friends.syncFacebookFriends` — fetches the user's Facebook friends list and matches against platform users (lane `sync_facebook`: concurrency 5, 5 per second)
- `find-your-friends.syncXFriends` — fetches the user's X following list and matches against platform users (lane `sync_x`: concurrency 2, 1 per 2 seconds)
- `find-your-friends.syncGithubFriends` — fetches the user's GitHub following list and matches against platform users (lane `sync_github`: concurrency 5, 5 per second)

A sync job runs only inside its own lane: the handler refuses a job whose ordering key is not its
provider's lane, so a job enqueued without the lane can never run unthrottled.

## Durable Recovery

A linked provider account with a usable encrypted token and `friends_synced_at IS NULL` (or older
than 24 hours) is the durable sync intent. OAuth completion attempts an immediate enqueue on a
best-effort basis and reports failures without failing the already-committed account connection.
The nightly `dispatchFindYourFriends` scan re-derives every still-eligible provider account from
PostgreSQL, so an initial Valkey outage cannot permanently lose friend recommendations.

Friend rows record provider observations in `last_observed_at`, using the fixed sync-start time.
Stale-row cleanup compares that named observation clock with the sync boundary, preserving the
exact PostgreSQL microsecond marker. The trigger maintains `updated_at` independently.

Each fetched provider page commits independently under a freshly acquired active-user mutation
fence. After the provider pagination completes, stale relationship candidates are selected in
bounded pages and each page is deleted in its own freshly fenced transaction; only an empty
candidate page permits `friends_synced_at` to advance. A failed or deletion-interrupted sync can
therefore leave committed current-page rows for the next idempotent sync without holding the account
deletion fence across the provider request or the full friend graph.

The dispatcher captures a fixed sweep time and each provider's greatest text ID. It applies the
registered `friends-dispatch-work-config` budget separately to each provider and reports `hasMore`.
Continuation payloads retain provider positions and completed providers. Eligibility also checks
account creation against the sweep time, since a newly inserted text ID can sort below the upper
bound. Failed or still-queued accounts are retried by the next sweep without starving later IDs.

Workers use [retained queue sweep ownership](../../../../development/postgresql/reference-cursors.md#retained-queue-sweeps)
to coalesce repeated roots and preserve successful cursor progress through bounded passes and retries.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- OAuth services: [../../services/oauth-facebook/README.md](../../services/oauth-facebook/README.md), [../../services/oauth-x/README.md](../../services/oauth-x/README.md), [../../services/oauth-github/README.md](../../services/oauth-github/README.md)
