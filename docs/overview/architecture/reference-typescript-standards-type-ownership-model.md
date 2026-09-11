# TypeScript Standards reference

[Back to TypeScript Standards](typescript-standards.md)

## Type Ownership Model

```text
backend/types/entities/   ← canonical API-facing entity types (Date timestamps)
    ↓ re-exports
backend/services/*/types.mts  ← service types (entities + internal input/option types)
    ↓ imports
backend/api/types.mts         ← response body types (composes entities + pagination)
```

```text
@voucha/types/entities/*  (canonical entity types, Date timestamps)
    ↓ Serialized<T>
web/types/api-responses.ts   (response body types, string timestamps)
```

> **Migration in progress**: community and notification entity types are already migrated. Post,
> topic, user, election, rss-feed, and rss-feed-item entity types in `web/types/` are still local
> copies as existing call sites are cleaned up.

## `Serialized<T>` — Date→string Conversion

Backend entity types use `Date` for timestamps. JSON serialization converts `Date` to ISO 8601 strings.
`Serialized<T>` converts all `Date` fields to `string` recursively without maintaining a duplicate type.

```ts
import type { Serialized } from '@voucha/types/serialized'
import type { Community } from '@voucha/types/entities/community'

// Web type: all Date fields become string, matching JSON-serialized API responses
type WebCommunity = Serialized<Community>
//   ↳ created_at: string  (was Date)
//   ↳ deleted_at: string | null  (was Date | null)
```

`Serialized<T>` handles:

- `Date` → `string`
- `Array<T>` / `ReadonlyArray<T>` → `Serialized<T>[]`
- `Record<K, T>` → `Record<K, Serialized<T>>`
- All other types pass through unchanged

## Pagination Types

`PageInfo`, `ListResponse<T>`, and `PaginatedResult<TEntityType>` are identical in both backend and
web (no Date fields). Import them from `@voucha/types/pagination`:

```ts
// backend API or web
import type { PageInfo, ListResponse, PaginatedResult } from '@voucha/types/pagination'
```

`PaginatedResponse<T>` is NOT shared because it references `ElectionVote`, which has different
shapes in backend (Date timestamps) vs web (string timestamps). Each side defines it locally.

## Entity Type Ownership

Canonical entity types live in `backend/types/entities/`. Service files **re-export** them:

```ts
// backend/services/communities/types.mts
export type { Community, CommunityMember, ... } from '@voucha/types/entities/community'

// Internal-only types (never cross API boundary) stay in the service file
export type CreateCommunityInput = { name: string; slug: string; ... }
```

Web imports entity types via the `@voucha/types` path alias:

```ts
// web/types/api-responses.ts
import type { Serialized } from '@voucha/types/serialized'
import type { Community as BackendCommunity } from '@voucha/types/entities/community'

export type Community = Serialized<BackendCommunity>
```

## Path Aliases

| Alias             | Resolves to                          |
| ----------------- | ------------------------------------ |
| `@voucha/types`   | `backend/types/index.mts`            |
| `@voucha/types/*` | `backend/types/*.mts` (any sub-path) |

Backend resolves `@voucha/types` as a pnpm workspace package through `node_modules` symlinks
(NodeNext module resolution) — `backend/tsconfig.json` has no `paths` entry for it. Web still
resolves it via a `paths` alias in `web/tsconfig.json`.

Note: web uses `moduleResolution: "bundler"` which doesn't automatically try `.mts` extensions
for path aliases, so the wildcard explicitly appends `.mts` (`"../backend/types/*.mts"`).

Web imports are type-only — erased at runtime, no bundling concern.

## `noUncheckedIndexedAccess`

Enabled in `web/tsconfig.json`. This makes array indexing and `Record<K, V>` lookups return
`T | undefined` instead of `T`, catching bugs where code assumes an index always exists.

```ts
const postsMap: Record<string, Post> = {}

// Before: post is Post (could be undefined at runtime!)
// After: post is Post | undefined — must check!
const post = postsMap[someId]

// Fix options:
const post = postsMap[someId]! // non-null assertion (when you know it exists)
const post = postsMap[someId] // conditional use: post?.title
const post = postsMap[someId] ?? null // explicit null fallback
```

For backend, `noUncheckedIndexedAccess` will be enabled in a future PR. The 437+ `rows[0]`
patterns require careful review (non-null assertion where SQL guarantees a row).

## `any` Policy

`any` is banned by oxlint (`typescript/no-explicit-any: "error"`). Use `unknown` instead.

Exception: generated files are allowed `any` (see `.oxlintrc.json` overrides).
