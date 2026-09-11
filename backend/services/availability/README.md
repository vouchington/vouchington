# Availability Service

Checks whether a unique field value is already taken for a given entity kind.
Exposed via `GET /api/v1/availability`.

## Bloom-filter strategy

For each kind backed by a bloom filter, `checkAvailability` calls
`bloom.exists(normalizeKey(value))`:

- `false` → definitely not in the filter → return `available: true` immediately
- `true` / `null` (filter absent) → confirm with DB

This avoids a DB round-trip for the common case of a completely new slug.

| Kind             | Bloom filter                          | DB getter            |
| ---------------- | ------------------------------------- | -------------------- |
| `topic-slug`     | `entityCacheBloomFilters.topics`      | `getTopicBySlug`     |
| `topic-name`     | none (direct DB)                      | `getTopicByName`     |
| `community-slug` | `entityCacheBloomFilters.communities` | `getCommunity`       |
| `post-slug`      | `entityCacheBloomFilters.posts`       | `getPostByAny`       |
| `username`       | `entityCacheBloomFilters.users`       | `getPublicUserByAny` |

## Return type

```ts
type AvailabilityResult = {
  available: boolean
  conflict: AvailabilityConflict | null
}
```

`conflict` is `null` when `available: true` or for `username` (no link shown).

## Usage

```ts
import { checkAvailability } from '@services/availability'

const result = await checkAvailability('topic-slug', 'developer-tools')
// { available: false, conflict: { kind: 'topic', id: '...', slug: 'developer-tools', name: 'Developer Tools', topic_type: 'topic' } }
```
