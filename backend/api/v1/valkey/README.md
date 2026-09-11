# Valkey Admin API

Admin-only endpoints for rebuilding Valkey bloom filters and managing entity caches.

## Endpoints

| Method | Route                                  | Authentication   | Description                       |
| ------ | -------------------------------------- | ---------------- | --------------------------------- |
| POST   | `/api/v1/valkey/bloom-filters/rebuild` | Required (admin) | Trigger bloom filter rebuild job  |
| GET    | `/api/v1/valkey/cache-groups`          | Required (admin) | List all entity cache groups      |
| POST   | `/api/v1/valkey/caches/clear`          | Required (admin) | Clear a cache group or all caches |
| POST   | `/api/v1/valkey/flush`                 | Required (admin) | Flush one scoped Valkey concern   |

## Authorization

All endpoints require admin access (`currentUserCanAccessValkeyAdmin`). Returns 401 if unauthenticated, 403 if not an admin.

## POST /api/v1/valkey/bloom-filters/rebuild

Triggers an async bloom filter rebuild job.

Request body: `{ filter: 'url-blocklist' | 'email-blocklist' | 'embedding' | 'entity-cache' | 'api-keys' }`
Response: `{ success: boolean, filter: string }`

## GET /api/v1/valkey/cache-groups

Returns all entity cache groups with their prefix lists.

Response: `{ groups: [{ name: string, prefixes: string[] }] }`

Cache groups: `users`, `topics`, `posts`, `rss`, `urls`, `elections`.

## POST /api/v1/valkey/caches/clear

Clears all keys for a cache group. The service sends all selected raw cache prefixes to one
`ValkeyCache.invalidateMany()` call; `group: 'all'` flattens all groups into that same call.

Request body: `{ group: string }` (group name or `'all'`)
Response: `{ success: boolean, group: string }`

## POST /api/v1/valkey/flush

Flushes every key for exactly one scoped concern — never a blunt `FLUSHDB`, since the keyspace is
flat (single db, no client-level `keyPrefix`). See
[service README § Flush Concerns](../../../services/valkey-admin/README.md#flush-concerns) for the
full concern → prefix mapping.

Request body: `{ concern: 'caches' | 'recently-viewed' | 'blooms' | 'rate-limiter' | 'dynamic-config' | 'sessions' | 'queues', force?: boolean }`
Response: `{ concern: <the accepted concern>, keysRemoved: number | null }` — the response concern
uses the same seven-value enum as the request; `keysRemoved` is `null` when the underlying mechanism
(`clearAllCaches()`, `RateLimiter.invalidate()`, `Queue.obliterate()`) doesn't report a count.

`concern: 'sessions'` returns 400 unless `force: true` is also passed — it logs out every user and
invalidates in-flight passkey/MFA/OAuth challenges. An unrecognized `concern` also returns 400.

## Performance

| Endpoint                                  | Round Trips | Caching | Notes                                                                                                        |
| ----------------------------------------- | ----------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| POST /api/v1/valkey/bloom-filters/rebuild | 1           | None    | Enqueue job (fire-and-forget)                                                                                |
| GET /api/v1/valkey/cache-groups           | 1           | None    | In-memory group list                                                                                         |
| POST /api/v1/valkey/caches/clear          | Variable    | None    | One cursor scan; each page uses SCAN plus optional UNLINK                                                    |
| POST /api/v1/valkey/flush                 | Variable    | None    | One cursor scan per concern prefix (SCAN+UNLINK), or a per-queue `obliterate()` call for `concern: 'queues'` |

The scan covers the full `cache:*` namespace and filters selected literal prefixes client-side.
This is a strict reduction in scans for `group: 'all'`; a single-group clear scans more broadly
than the former per-prefix implementation.

## Related

- Service: [../../../services/valkey-admin/](../../../services/valkey-admin/README.md)
- Entity cache: [../../../services/entity-cache/](../../../services/entity-cache/README.md)
- Bloom filter config: [../dynamic-config/README.md](../dynamic-config/README.md) namespace `bloom-filter-config`
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
