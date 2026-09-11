# Vote Integrity API

Admin-only endpoints for reviewing and acting on suspicious voting patterns.

All endpoints require `administrator` role.

## Flags

| Method | Path                                         | Description                           |
| ------ | -------------------------------------------- | ------------------------------------- |
| GET    | `/api/v1/vote-integrity/flags`               | List flags (paginated)                |
| GET    | `/api/v1/vote-integrity/flags/:id`           | Get single flag                       |
| PATCH  | `/api/v1/vote-integrity/flags/:id`           | Resolve a flag                        |
| POST   | `/api/v1/vote-integrity/flags/:id/penalties` | Apply ring penalty for flagged entity |

### GET /api/v1/vote-integrity/flags

Query params:

- `status` — `pending` | `resolved` (default: all)
- `after` — opaque cursor for pagination
- `limit` — 1–100 (default: 25)

Flag cursors are scoped to this resource, the normalized status, and `id DESC`. Legacy simple UUID
cursors remain accepted during deployment compatibility; mismatched scoped cursors return 400.

### PATCH /api/v1/vote-integrity/flags/:id

Body: `{ "resolution": "dismissed" | "penalized" | "suspended" }`

### POST /api/v1/vote-integrity/flags/:id/penalties

Applies a `DEFAULT_PENALTY_MULTIPLIER` (0.2) vote weight penalty to all users who upvoted the flagged entity. Enqueues vote weight recalculation for all affected users.

Response: `{ "penalized_user_count": number }`

This mutation does not resolve the flag. Resolution remains an explicit `PATCH /flags/:id`
decision, so applying a penalty never invents a resolution or resolver.

## Penalties

| Method | Path                                   | Description                                      |
| ------ | -------------------------------------- | ------------------------------------------------ |
| GET    | `/api/v1/vote-integrity/penalties`     | List penalties (paginated)                       |
| GET    | `/api/v1/vote-integrity/penalties/:id` | Get one authoritative penalty for reconciliation |
| DELETE | `/api/v1/vote-integrity/penalties/:id` | Revoke a penalty                                 |

### GET /api/v1/vote-integrity/penalties

Query params:

- `status` — `active` | `revoked` (default: all)
- `source` — `flag` limits the ledger to durable `voting_ring` audit rows; omitted means all sources
- `user_id` — filter by user
- `source_flag_id` — filter by the originating vote-integrity flag
- `after` — opaque cursor for pagination
- `limit` — 1–100 (default: 25)

The opaque cursor is bound to the normalized status, source, user, source-flag, and `id DESC`
ordering. Reusing it with any changed filter returns 400. `source=flag` uses the stable
`voting_ring` reason, so a retained penalty remains in the ledger after its source flag is deleted.
Legacy simple UUID cursors remain accepted during deployment compatibility, but a wrong-scope
scoped cursor never falls back to legacy handling. Filtered responses add exactly
`filter_scope: { source: "flag", source_flag_id: string | null }`; all-source responses omit it.

## Performance

| Endpoint                                        | Round Trips                                   | Caching | Notes                                                                |
| ----------------------------------------------- | --------------------------------------------- | ------- | -------------------------------------------------------------------- |
| GET /api/v1/vote-integrity/flags                | 1                                             | None    | Admin paginated query                                                |
| GET /api/v1/vote-integrity/flags/:id            | 1                                             | None    | Admin single fetch                                                   |
| PATCH /api/v1/vote-integrity/flags/:id          | 1                                             | None    | Admin write                                                          |
| POST /api/v1/vote-integrity/flags/:id/penalties | 1 replica read + 1-2 transactional statements | None    | Asynchronously bulk-enqueues recalculation when users were penalized |
| GET /api/v1/vote-integrity/penalties            | 1                                             | None    | Admin paginated query                                                |
| GET /api/v1/vote-integrity/penalties/:id        | 1                                             | None    | Admin exact read for mutation reconciliation                         |
| DELETE /api/v1/vote-integrity/penalties/:id     | 1 primary write                               | None    | Asynchronously enqueues one forced recalculation after success       |

## Related

- [backend/services/vote-integrity/README.md](../../../services/vote-integrity/README.md)
- [backend/queues/vote-integrity/README.md](../../../queues/vote-integrity/README.md)
