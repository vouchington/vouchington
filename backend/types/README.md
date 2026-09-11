# Types

This module (`@voucha/types`) contains all shared TypeScript types for the backend.
It is the **canonical source of truth** for all API-facing entity types.

## Structure

```text
backend/types/
  enqueue.mts             # EnqueueReturnType for queue functions
  serialized.mts          # Serialized<T> utility — converts Date fields to string
  pagination.mts          # PageInfo, ListResponse, PaginatedResult (shared with web)
  entities/
    community.mts         # Community, CommunityMember, CommunityMetrics, etc.
    election.mts          # ElectionVote, ViewBaseElection, AggregatedElectionStats
    notification.mts      # Notification, NotificationResult, WebPushSubscriptionRecord
    post.mts              # Post, PostType, PostMetrics, PostElection
    topic.mts             # Topic, TopicTypes, topicTypes const, TopicMetrics, TopicElection
    user.mts              # BasicUser, PublicUser, PrivateUser, UserMetrics
    index.mts             # barrel re-exports from all entity files
  index.mts               # top-level barrel re-exports
```

## Type Ownership

- **[`backend/types/entities/`](entities/)** — canonical API-facing entity types. All shapes use `Date` for timestamps.
- **`backend/services/*/types.mts`** — re-exports canonical types + defines internal-only types (input/option types that never cross the API boundary, like `CreatePostUpdates`, `UpsertUserOptions`).
- **[`backend/api/types.mts`](../api/types.mts)** — response body types that compose entities + pagination. Imports from `@voucha/types`.
- **[`web/types/`](../../web/types/)** — web uses `Serialized<T>` from `@voucha/types/serialized` to convert `Date → string` for JSON-serialized API responses.

## `Serialized<T>` Pattern

Backend entity types use `Date` for timestamps. JSON serialization converts `Date` to ISO strings.
Use `Serialized<T>` in the web to get the string version without maintaining a duplicate type:

```ts
import type { Serialized } from '@voucha/types/serialized'
import type { Community } from '@voucha/types/entities/community'

// Web type — all Date fields become string
type WebCommunity = Serialized<Community>
```

`Serialized<T>` is recursive — it converts all nested `Date` fields too.

## Path Aliases

`@voucha/types` is available in:

- **Backend**: resolved as the `@voucha/types` pnpm workspace package (NodeNext module resolution through `node_modules` symlinks) — `backend/tsconfig.json` has no `paths` alias for it.
- **Web**: [`web/tsconfig.json`](../../web/tsconfig.json) → `../backend/types` and `../backend/types/*`

Web imports are type-only (erased at runtime), so no bundling concern.

## Ambient Third-Party Boundaries

Prefer a dependency's bundled declarations, then maintained `@types/*` declarations. Keep a custom
ambient declaration only when neither provides the backend's required safe surface, and narrow it to
the members the backend actually consumes. Type-only contract tests guard each retained declaration;
do not add tests for a dependency's own runtime behavior. See the
[TypeScript standards](../../docs/overview/architecture/typescript-standards.md#third-party-type-declarations).

| Declaration                    | Why it remains                                                                                                                                        | Verification                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `http-assert.d.ts`             | The package has no bundled types; the broader `@types` contract makes the required status optional, while the backend uses one exact callable shape.  | `../modules/utils/http-assert.test.mts` (type-only).         |
| `sql-template-strings.d.ts`    | The bundled declaration is not callable through the backend's NodeNext default import and exposes `any`; only the consumed statement surface remains. | `../test-helpers/sql-template-strings.test.mts` (type-only). |
| `vitest-loose-mock/index.d.ts` | Test-only global for explicitly loose mock call signatures while preserving resolved-value types.                                                     | Repository Vitest mock-typing static checks and suites.      |

## When to Use Each Level

| Where                     | Import from                                                     |
| ------------------------- | --------------------------------------------------------------- |
| Backend service functions | `@services/*/types` (re-exports from `@voucha/types/entities/`) |
| Backend API routes        | `@voucha/api/types` or `@services/*/types`                      |
| Web (entity shapes)       | `@voucha/types/entities/*` with `Serialized<T>`                 |
| Web (pagination)          | `@voucha/types/pagination`                                      |

## Related

- Backend context: [../CLAUDE.md](../CLAUDE.md)
- Services (consume these types): [../services/CLAUDE.md](../services/CLAUDE.md)
- API routes (consume these types): [../api/CLAUDE.md](../api/CLAUDE.md)
- TypeScript standards: [../../docs/overview/architecture/typescript-standards.md](../../docs/overview/architecture/typescript-standards.md)
