# Hostname Blocking

Admin service for blocking hostnames site-wide. Blocking a hostname removes associated URL links, applies vote weight penalties to users who posted them, and deters future link attempts.

## Functions

### `blockHostname(adminUserId, hostnameId, options?): Promise<BlockHostnameResult>`

Blocks a hostname and all its subdomains atomically in a transaction:

1. Sets `blocked = true`, `blocked_at`, `blocked_by_id` on the target hostname
2. Finds all subdomains (`hostname LIKE '%.<target>'`) and blocks them too
3. Soft-deletes all URL entity relations (across all relation tables) pointing to URLs under these hostnames
4. Inserts a one-time 20% vote weight penalty (`reason = 'blocked_hostname'`) for each user who created those relations, keyed by `source_hostname_id` so it's idempotent

`options.penalizeCreators = false` is used by automated Google Web Risk blocks. Those blocks still soft-delete matching relations and block subdomains, but do not apply the initial creator penalty.

After the transaction, enqueues vote weight recalculation for all affected users.

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

- **[`backend/api/v1/hostnames/hostname.mts`](../../api/v1/hostnames/hostname.mts)** — PATCH route calls `blockHostname` when `blocked: true`
- **[`backend/services/urls/assert-hostname-not-blocked.mts`](../urls/assert-hostname-not-blocked.mts)** — calls `penalizeBlockedHostnameAttempt` before throwing 422
- **[`backend/services/entity-relations/upsert.mts`](../entity-relations/upsert.mts)** — passes `creator.id` to blocked hostname check

## Related

- Vote weight penalties: `backend/data-stores/psql/migrations/0240-00-00-elections-vote-integrity.sql`
- Migration: `backend/data-stores/psql/migrations/0050-00-00-urls-hostnames-crawlers.sql`
- Vote integrity service: [backend/services/vote-integrity/README.md](../vote-integrity/README.md)
- [docs/requirements/content/HOSTNAME-BLOCKING.md](../../../docs/requirements/content/HOSTNAME-BLOCKING.md)
