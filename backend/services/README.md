# Services

Services contain business logic and are re-used across APIs, job queues, and other entry points.

## Service Scope

Each service encapsulates domain and business logic for its area, including SQL queries and external integrations. Do not define logic that operates on unrelated domains. When in doubt, create a new service.

## Authorization

Boolean authorization checks must be in `authorization.mts` and named `currentUserCan*`. Additional assertion helpers (e.g. `assertCan*`) may also be exported from this file.

### Pattern

```typescript
// backend/services/posts/authorization.mts
import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'

export function currentUserCanUpdatePost(currentUser: PrivateUser | null, post: Post): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return post.created_by_id === currentUser.id
}
```

### Usage in APIs

```typescript
import { currentUserCanUpdatePost } from '@services/posts/authorization'
import createHttpError from 'http-errors'

if (!currentUserCanUpdatePost(currentUser, post)) {
  throw createHttpError(403, 'Forbidden')
}
```

### Authorization Patterns

- **Ownership checks**: `entity.created_by_id === currentUser.id`
- **Role-based**: `currentUser.roles.includes('administrator')`
- **Combined**: Owners OR admins
- **SQL-based**: Build SQL filters (see `buildDraftVisibilitySQL` in [posts/authorization.mts](./posts/authorization.mts))

## Error Handling

### Structured Error Properties

**Avoid checking `error.message`** for internally created errors. Use `error.name`, `error.code`, or `error.status` instead.

### HTTP Errors

Use `http-errors` or `http-assert` for creating errors. Use `createCodedError` when the client needs to branch on the error type:

```typescript
import createHttpError from 'http-errors'
import assert from 'http-assert'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { RATE_LIMIT } from '@modules/on-error/error-codes'

throw createHttpError(404, 'Post not found')
throw createCodedError(429, 'Rate limit exceeded', RATE_LIMIT)
assert(post, 404, 'Post not found')

// With cause
try {
  await externalAPI()
} catch (error) {
  throw createHttpError(500, 'External API failed', { cause: error })
}
```

### Centralized Error Handling

```typescript
import onError from '@modules/on-error'

try {
  await riskyOperation()
} catch (error) {
  onError(error, {
    context: { userId, operation: 'createPost' },
    tags: { critical: true },
  })
  throw error
}
```

## Data Deduplication

Deduplicate expensive operations (API calls, computations) using content hashing.

### Pattern: Content SHA256

```typescript
import { createHash } from 'node:crypto'

const content = JSON.stringify(data)
const contentSha256 = createHash('sha256').update(content).digest()

const existing = await findByContentHash(contentSha256)
if (existing) {
  return { ...existing, reused: true }
}

const result = await expensiveOperation(data)
await storeResult(contentSha256, result)
return result
```

### Examples

- [openai-moderation/posts.mts](./openai-moderation/posts.mts) — Reuse moderation results for identical content
- [bedrock-embeddings/README.md](./bedrock-embeddings/README.md) — Reuse embeddings for identical text

## Batch Lookups

Services that accept ordered identifier lists should use the shared helpers in
[batch-lookup/README.md](./batch-lookup/README.md) to normalize typed identifiers, build ordered SQL
input CTEs, and scatter query rows back into caller order.

## Dependency-Inversion Registries

A service that needs a handler owned by another service — without creating a workspace-package
dependency edge back to it — exposes a `register*()`/`getRegistered*()` pair (a
`*-registry.mts` file) instead of importing that service directly. The owning service wires its
handler in by calling `register*()` at module-top-level inside a `register-*.mts` file; the
registry's `getRegistered*()` getter throws a coded `*_UNREGISTERED` error
(`backend/modules/on-error/error-codes.mts`) if nothing has registered yet.

That throw is a runtime assertion on a load-time invariant, so every `register-*.mts` module must
actually be imported for its side effect by every process entrypoint — not conditionally, by
whichever deep import path an entrypoint happens to pull in. `backend/service-registrations/` is
the single place this happens: its `index.mts` imports every registrar for its side effect, and
`backend/entrypoints/{api,worker-cpu,worker-io}/index.mts` and `backend/scripts/seed/index.mts`
each import `@backend/service-registrations` once, unconditionally, as their first import. Adding a
registry means adding one import to `backend/service-registrations/index.mts` — nothing else needs
to change per-entrypoint.

`.no-mistakes.yml`'s `required-entrypoint-reachability` rules enforce both halves statically: every
`backend/services/**/register-*.mts` must be reachable from `backend/service-registrations/index.mts`,
and `backend/service-registrations/index.mts` must in turn be reachable from every process
entrypoint. A new registrar that isn't wired into the registration root, or an entrypoint that stops
importing it, fails `pnpm run no-mistakes` instead of failing silently at runtime. See
[reference-tests-linters-and-static-analysis.md](../../docs/development/reference-tests-linters-and-static-analysis.md)
for the full static-analysis catalog.

## Related

- [Post publication reconciliation](post-publication/README.md) — Durable capture, projection, and shadow-repair services
- [Backend Vitest test authoring skill](../../.agents/skills/backend-vitest-test-authoring/SKILL.md) — Tests, fixtures, integration boundaries, and provider mocks
- [Agent conventions](CLAUDE.md) — Service authoring rules for agents
- [Systems (Job Queues)](../queues/README.md) — Background job processing
- [API Routes](../api/CLAUDE.md) — HTTP endpoint conventions
- [Data Stores](../data-stores/psql/README.md) — PostgreSQL schema and migrations
- [Error Module](../modules/on-error/README.md) — Centralized error handling
- [Documentation](../../docs/README.md) — Full documentation index
