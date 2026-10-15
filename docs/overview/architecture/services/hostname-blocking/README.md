# Hostname Blocking

Source entrypoint: [backend/services/hostname-blocking/README.md](../../../../../backend/services/hostname-blocking/README.md)

Admin service for blocking hostnames site-wide. Blocking a hostname removes associated URL links, applies vote weight penalties to users who posted them, and deters future link attempts.

## Functions

### `blockHostname(adminUserId, hostnameId, options?): Promise<BlockHostnameResult>`

Blocks a hostname and all its subdomains atomically in a transaction:

1. Inserts active `url_hostname_blocks` history for the target; a trigger projects URL block history to `url_hostnames.is_blocked`
2. Finds all subdomains (`hostname LIKE '%.<target>'`) and inserts their block history too
3. Soft-deletes all URL entity relations (across all relation tables) pointing to URLs under these hostnames
4. Inserts a one-time 20% vote weight penalty (`reason = 'blocked_hostname'`) for each user who created those relations, keyed by `source_hostname_id` so it's idempotent

`options.penalizeCreators = false` is used by automated Google Web Risk blocks. Those blocks still soft-delete matching relations and block subdomains, but do not apply the initial creator penalty.

After the transaction, enqueues vote weight recalculation for all affected users.
Blocking and unblocking enqueue affected hostname IDs in the same transaction. An inline bounded
cache pass runs after commit; the scheduled blacklist worker resumes failed eviction work.

Domain blacklist sync stores each input domain with a `url_hostname_id` and projects a source-owned
history row. URL sources affect crawl policy; email-only sources affect email eligibility without
blocking URL crawls. `unblockHostname` lifts admin, Web Risk, and inherited hostname history but
preserves source-owned rows. Removing a domain from its source lifts that source's history. Manual
blocks and inherited parent blocks remain active when a source is removed.

**Returns:**

```ts
{
  blocked_hostname_count: number // target + subdomains blocked
  soft_deleted_relation_count: number // entity relations removed
  penalized_user_count: number // users penalized this call
}
```

### `penalizeBlockedHostnameAttempt(userId): Promise<void>`

Inserts a stacking 20% vote weight penalty (`reason = 'blocked_hostname_attempt'`, `source_hostname_id = NULL`) each time a user tries to link a URL with a blocked hostname. Each attempt adds another penalty, which compounds multiplicatively.

## Penalty Reasons

| Reason                     | Description                                                  | Deduplication                                                    |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `blocked_hostname`         | One-time penalty when admin blocks a hostname                | One per `(user, hostname)` via `source_hostname_id` unique index |
| `blocked_hostname_attempt` | Per-attempt penalty for trying to link blocked hostname URLs | None — stacks on every attempt                                   |

## Integration Points

- **[`backend/api/v1/hostnames/hostname.mts`](../../../../../backend/api/v1/hostnames/hostname.mts)** — PATCH route calls `blockHostname` when `blocked: true`
- **[`backend/services/urls/assert-hostname-not-blocked.mts`](../../../../../backend/services/urls/assert-hostname-not-blocked.mts)** — calls `penalizeBlockedHostnameAttempt` before throwing 422
- **[`backend/services/entity-relations/upsert.mts`](../../../../../backend/services/entity-relations/upsert.mts)** — passes `creator.id` to blocked hostname check

## Related

- Vote weight penalties: `backend/data-stores/psql/migrations/0240-00-00-elections-vote-integrity.sql`
- Migration: `backend/data-stores/psql/migrations/0050-00-00-urls-hostnames-crawlers.sql`
- Vote integrity service: [docs/overview/architecture/services/vote-integrity/README.md](../vote-integrity/README.md)
- [docs/requirements/content/HOSTNAME-BLOCKING.md](../../../../requirements/content/HOSTNAME-BLOCKING.md)
