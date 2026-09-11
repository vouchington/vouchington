# Friend Recommendations

Social graph friend discovery via OAuth-connected accounts (Facebook, X, GitHub).

## Overview

This service finds users on the platform who are friends/followers on connected social accounts. It queries the provider-specific friend tables, deduplicates across providers, and excludes users the current user already follows, mutes, blocks, or has dismissed. A background sync system periodically refreshes friend lists from each provider's API.

## Key Files

- `get-recommendations.mts` — Main query: joins Facebook, X, and GitHub friend tables against platform users, applies exclusion filters, returns paginated results with cursor-based pagination
- `accounts-to-sync.mts` — Streams accounts due for friend list refresh (24-hour sync interval) using PostgreSQL cursor-based async generators

## Exclusion Filters

Recommendations exclude users who are:

- Already followed by the current user
- Muted by the current user
- Blocked in either direction
- Previously dismissed via `relation__user__dismiss_recommendation__user`

## Sync Infrastructure

Three async generators stream accounts needing sync:

- `streamFacebookAccountsToSync()` — Facebook accounts with valid access tokens
- `streamXAccountsToSync()` — X accounts with valid/refreshable tokens
- `streamGithubAccountsToSync()` — GitHub accounts with valid access tokens

All use a 24-hour sync interval and batch size of 1000. A newly linked account retains
`friends_synced_at = NULL` until its provider sync succeeds; this is the durable intent used by the
nightly dispatcher when OAuth's immediate best-effort enqueue fails.

## Architecture Notes

- The recommendation query uses a single CTE with `UNION ALL` across all three providers, then deduplicates with `DISTINCT ON (id)`
- Cursor-based pagination uses owner- and resource-scoped `id ASC` cursors. The decoder temporarily
  accepts the previous simple ID cursor during the prelaunch contraction window; newly emitted
  cursors are always scoped.
- Each recommendation result includes the provider name and friend's display name from that provider
- Friend sync jobs are enqueued via the OAuth flow when accounts are connected

## Related

- OAuth service: [backend/services/oauth/README.md](../oauth/README.md)
- Friend sync jobs: [backend/queues/find-your-friends/README.md](../../queues/find-your-friends/README.md)
- Entity relations (follow, mute, block): [backend/services/entity-relations/README.md](../entity-relations/README.md)
