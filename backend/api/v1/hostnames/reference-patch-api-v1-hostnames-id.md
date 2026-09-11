# PATCH /api/v1/hostnames/:id

[Back to Hostnames API](README.md#patch-apiv1hostnamesid)

Update hostname moderation fields.

**Admin only.** Returns 401 for unauthenticated, 403 for non-admin.

Request body: `{ blocked?: boolean, crawlable?: boolean, link_rel_follow?: boolean, ignore_robots_txt?: boolean | null, unreliable_status_codes?: number[] | null }`

### Blocking side effects (`blocked: true`)

When `blocked` is set to `true`, the full blocking flow runs via `blockHostname()`:

1. Sets `blocked = true`, `blocked_at`, `blocked_by_id` on the target hostname and all subdomains
2. Soft-deletes all URL entity relations (across all relation types) pointing to URLs under those hostnames
3. Applies a one-time 20% vote weight penalty (`reason = 'blocked_hostname'`) to all users who created those relations — idempotent, will not duplicate on re-block

Returns 200 with: `{ blocked_hostname_count, soft_deleted_relation_count, penalized_user_count }`

### Unblocking (`blocked: false`)

Simple field update — no penalty revocation, no relation restoration. Returns 204.

### Ongoing penalty for new attempts

After a hostname is blocked, any user who tries to add an entity relation to a URL under that hostname receives an additional stacking 20% penalty per attempt (`reason = 'blocked_hostname_attempt'`). See `@services/hostname-blocking`.

### Other fields

Returns 204 with no body for `crawlable`, `link_rel_follow`, `ignore_robots_txt`, and
`unreliable_status_codes` changes. `unreliable_status_codes` marks RSS fetch 4xx statuses as
retryable instead of soft-deleting feeds on the hostname; `null` clears the hostname override.
