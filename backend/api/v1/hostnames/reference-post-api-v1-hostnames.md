# POST /api/v1/hostnames

[Back to Hostnames API](README.md#post-apiv1hostnames)

Upsert a hostname by string and optionally block it in a single request.

**Admin only.** Returns 401 for unauthenticated, 403 for non-admin.

Request body: `{ hostname: string, blocked?: boolean }`

- `hostname` — hostname string (e.g. `example.com`). Protocol prefix (`https://`) is stripped automatically. Path components are rejected (422).
- `blocked` — if `true`, runs the full block flow via `blockHostname()` (same side effects as `PATCH /:id` with `blocked:true`).

Response: `{ id, hostname }` for create-only; `{ id, hostname, blocked_hostname_count, soft_deleted_relation_count, penalized_user_count }` when `blocked:true`.

Idempotent: calling with an existing hostname returns the existing record's `id`.
