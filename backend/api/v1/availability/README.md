# GET /api/v1/availability

Checks whether a unique field value is available for a given entity kind, using
the entity-cache bloom filters for a fast short-circuit before a confirming DB
lookup.

## Request

```
GET /api/v1/availability?kind=<kind>&value=<value>
Authorization: session cookie (401 if unauthenticated)
```

| Parameter | Required | Description                                                                   |
| --------- | -------- | ----------------------------------------------------------------------------- |
| `kind`    | yes      | One of: `topic-slug`, `topic-name`, `community-slug`, `post-slug`, `username` |
| `value`   | yes      | The value to check                                                            |

## Response

```json
{ "available": true, "conflict": null }
```

```json
{
  "available": false,
  "conflict": {
    "kind": "topic",
    "id": "...",
    "slug": "developer-tools",
    "name": "Developer Tools",
    "topic_type": "topic"
  }
}
```

For `username`, `conflict` is always `null` (available/taken only — no link).

## Performance

| Step         | Detail                                                              |
| ------------ | ------------------------------------------------------------------- |
| Bloom filter | O(1) `BF.EXISTS` via Valkey — short-circuits when definitely absent |
| DB confirm   | One indexed lookup when bloom returns `true`/`null`                 |
| Rate limit   | Standard per-route via `requireAuth`                                |

The bloom filter covers `topic-slug`, `community-slug`, `post-slug`, and
`username`. `topic-name` falls back directly to a DB lookup
(`LOWER(name)` index).
