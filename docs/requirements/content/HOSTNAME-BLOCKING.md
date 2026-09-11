# Hostname Blocking

Site-wide hostname blocking allows admins to suppress all content from a given domain (and its subdomains).

## Admin UI

| Task                        | Location                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| Toggle flags per hostname   | `/domain/<hostname>` → **Moderation** tab (interactive switches) |
| Browse blocked hostnames    | `/domains?blocked=true` (admin filter)                           |
| Quick-add (block by string) | `/domains` — "Block hostname" form (admin only)                  |
| View crawlers for hostname  | `/domain/<hostname>` → **Crawlers** tab                          |

## Admin Actions

### Block a Hostname

`PATCH /api/v1/hostnames/:id` with `{ blocked: true }` — admin only.

Triggers the full blocking flow atomically:

1. **Mark as blocked**: Sets `blocked = true`, `blocked_at`, `blocked_by_id` on the target hostname and all subdomains (e.g. blocking `example.com` also blocks `www.example.com`, `cdn.example.com`). Newly inserted future subdomains inherit parent hostname blocks.
2. **Soft-delete relations**: All entity relations that link to URLs under the blocked hostnames are soft-deleted (post→url, topic→url, user→save→url, etc.).
3. **Apply penalty**: Each user who created one of those relations receives a one-time 20% vote weight penalty (`reason = blocked_hostname`). Re-blocking is idempotent — no duplicate penalties.

Returns `{ blocked_hostname_count, soft_deleted_relation_count, penalized_user_count }`.

Google Web Risk can also block a registrable domain automatically after local checks pass. Automated Web Risk blocks store the checked URL/threat metadata, skip the initial creator penalty, and rely on the local parent-domain block for future URLs so Google is not called again. Admins can set `skip_web_risk = true` on trusted hostnames; the flag applies to subdomains.

### List Blocked Hostnames

`GET /api/v1/hostnames/blocked` — admin only. Paginated list of all currently blocked hostnames.

### Unblock a Hostname

`PATCH /api/v1/hostnames/:id` with `{ blocked: false }` — simple field update, no penalty revocation and no relation restoration.

## Ongoing Enforcement

After a hostname is blocked, any user who tries to create an entity relation to a URL under that hostname is:

- Blocked from creating the relation (422 error)
- Penalized with a stacking 20% vote weight penalty (`reason = blocked_hostname_attempt`) per attempt

This penalty stacks: three attempts result in three separate penalty rows.

## Visibility

- Blocked hostnames are hidden from non-admin users: `GET /api/v1/hostnames/:id` returns 404.
- Admins see blocked hostnames normally with full moderation fields.

## Vote Weight Penalties

| Reason                     | Multiplier | Stacks? | Source                                |
| -------------------------- | ---------- | ------- | ------------------------------------- |
| `blocked_hostname`         | 0.2 (20%)  | No      | One per (user, hostname) — idempotent |
| `blocked_hostname_attempt` | 0.2 (20%)  | Yes     | One per attempt to link blocked URL   |

## Implementation

- Service: `backend/services/hostname-blocking/`
  - `blockHostname(adminUserId, hostnameId)` — core blocking flow
  - `penalizeBlockedHostnameAttempt(userId)` — per-attempt penalty
- API: `backend/api/v1/hostnames/hostname.mts` — PATCH route dispatches to `blockHostname`
- Enforcement: `backend/services/entity-relations/upsert.mts` calls `assertUrlsHaveNoBlockedHostnames` with `userId` for all URL-object relations

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- Service docs: [backend/services/hostname-blocking/README.md](../../../backend/services/hostname-blocking/README.md)
- API docs: [backend/api/v1/hostnames/README.md](../../../backend/api/v1/hostnames/README.md)
- Vote integrity: [backend/services/vote-integrity/README.md](../../../backend/services/vote-integrity/README.md)
