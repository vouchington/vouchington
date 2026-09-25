# Entity Relations API

Manage directed editorial relationships between entities.

Personal user relations (follow, mute, block, save, hide, subscribe,
dismiss_recommendation, proxy_follow, etc.) live at `/api/v1/bookmarks/`. The only supported
user-subject tuple here is `user → category → topic`, used for curated moderation tags. That tuple
requires authentication; every other user-subject tuple returns `400`.

## Endpoints

| Method | Route                                                                   | Authentication | Description                                                           |
| ------ | ----------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| GET    | `/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType` | Optional       | List relations for a subject entity                                   |
| POST   | `/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType` | Required       | Create a new entity relation                                          |
| GET    | `/api/v1/entity-relations/:id/votes`                                    | Required       | List votes for an entity relation (admins list all voters, paginated) |

## Path Parameters

- `entityType` — subject entity type: `post`, `topic`, `rss_feed_item`, or `user` for the exact moderation-tag tuple
- `entityId` — subject entity ID (UUID)
- `predicate` — relation type (e.g. `similar`, `related`)
- `objectType` — object entity type: `post`, `topic`, or `rss_feed_item`

## GET /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType

Returns relations from subject to objects of the given type.

Query parameters:

- `minNetVoteScore` — filter by minimum net vote score (election-only)
- `positiveNetVoteScore` — boolean; when `true`, filters to `votes_score_net > 0` (election-only; maps to the `idx_*__votes_score_sort__pos__id` partial index)
- `limit` — max results (1–200, default 100)
- `after` — opaque continuation cursor from `page_info.end_cursor`
- `sort` — `best` (default) or `newest`
- `summary` — only valid for `post → related → url`. It applies the runtime-configured
  `post-related-url-display-config.summary_limit` (default and maximum 10), filters to positive
  scores, and uses `best` order. Do not combine it with `limit`, `sort`, or vote-score filters.

The cursor is scoped to the resolved subject/predicate/object tuple, summary mode, sort, and vote filters. It
contains the full deterministic order including the object UUID tie-breaker, and the query fetches
`limit + 1` rows for accurate `page_info`.

Response: `{ results: [...], page_info: {...}, entity_relations: {...}, entity_relation_elections: {...} }`. For authenticated users, also includes `election_votes`.

- `entity_relation_elections` — Record keyed by relation ID with vote summaries (`votes_score_net`, `votes_count_up`, `votes_count_down`). Returned for all users (5-min cache TTL, separate from relation data).

Visibility follows the reader:

- Relations whose subject or object post the reader cannot view are left out.
- `created_by_id` is `null` when the creator is the anonymous author of the subject or object post, unless the reader is that author or an administrator.
- `object_data` holds only the public fields for its type. See [Viewer and projection](../../../services/entity-relations/README.md#viewer-and-projection).

## POST /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType

Creates a new entity relation and automatically casts Confirm for it.

For `user → category → topic`, the target must be another existing user and the object must be a
curated user-tag topic. Eligible signed-in users may propose tags; administrators may also propose
and vote as moderation. Self-tagging and arbitrary topics are rejected.

**Request:**

```json
{ "objectId": "<uuid>" }
```

When the subject or object is a post the caller cannot view, or its ID is not a UUID, the route returns `404`.

**Response:** `201 Created` with `{ relation: { ... } }`. The relation is read back through the same viewer-scoped query as GET, so it has the same projection and creator masking.

## GET /api/v1/entity-relations/:id/votes

Admins list all voters; other authenticated users see only their own vote.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource/cross-branch cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.

## Performance

| Endpoint                                                                   | Round Trips | Caching                                                  | Notes                                                                                                       |
| -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType  | 2           | HTTP: anon Cache-Control (short); Entities: Valkey batch | Search IDs, then parallel streaming (elections, votes)                                                      |
| POST /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType | 4-7         | None (write)                                             | Auth, parse, upsert, read-back; post tuples add a visibility check; community relations add 2 extra lookups |
| PUT /api/v1/entity-relations/:id/vote                                      | 4           | Entities: Valkey batch                                   | Standard vote handler (auth, plan check, entity lookup, upsert)                                             |
| GET /api/v1/entity-relations/:id/votes                                     | 3           | Entities: Valkey batch                                   | Auth, cached entity lookup, votes query                                                                     |

## Related

- Service: [../../services/entity-relations/](../../../services/entity-relations/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
