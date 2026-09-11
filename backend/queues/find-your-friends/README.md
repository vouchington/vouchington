# Find Your Friends System

Syncs social connections from Facebook, X, and GitHub to discover existing platform users.

## Queue Configuration

### `find-your-friends` (concurrency: 10)

- `dispatchFindYourFriends` — dispatcher that enqueues social sync jobs for all OAuth providers linked to a user
- `syncFacebookFriends` — fetches the user's Facebook friends list and matches against platform users (global concurrency: 5)
- `syncXFriends` — fetches the user's X following list and matches against platform users (global concurrency: 2)
- `syncGithubFriends` — fetches the user's GitHub following list and matches against platform users (global concurrency: 5)

## Durable Recovery

A linked provider account with a usable encrypted token and `friends_synced_at IS NULL` (or older
than 24 hours) is the durable sync intent. OAuth completion attempts an immediate enqueue on a
best-effort basis and reports failures without failing the already-committed account connection.
The nightly `dispatchFindYourFriends` scan re-derives every still-eligible provider account from
PostgreSQL, so an initial Valkey outage cannot permanently lose friend recommendations.

Each fetched provider page commits independently under a freshly acquired active-user mutation
fence. After the provider pagination completes, stale relationship candidates are selected in
bounded pages and each page is deleted in its own freshly fenced transaction; only an empty
candidate page permits `friends_synced_at` to advance. A failed or deletion-interrupted sync can
therefore leave committed current-page rows for the next idempotent sync without holding the account
deletion fence across the provider request or the full friend graph.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth services: [../../services/oauth-facebook/README.md](../../services/oauth-facebook/README.md), [../../services/oauth-x/README.md](../../services/oauth-x/README.md), [../../services/oauth-github/README.md](../../services/oauth-github/README.md)
