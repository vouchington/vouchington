# Pagination Module

All paginated endpoints use the unified pagination module at `modules/pagination/`.
The public API and client behavior are canonical in [Cross-Surface Cursor Pagination](../../../docs/overview/architecture/pagination.md); this page owns backend parser and cursor utilities.

The module is a compatibility adapter over [`@vouchington/pagination`](https://www.npmjs.com/package/@vouchington/pagination). It re-exports generic cursor envelopes, guards, and scoped decoders directly instead of maintaining local facade shells. Local adapters retain Voucha's response field names, filter catalogs, parser configuration, and query-contract types needed for exact OpenAPI literal inference while delegating their generic runtime behavior to the package.

## Standards

- **Cursor parameters**: Forward continuation uses `after`; bidirectional endpoints may also use
  `before`. Never expose a generic `cursor` query parameter. Existing migrations may accept
  legacy cursor parameter names through parser config without advertising them in query metadata.
- **Cursor format**: Opaque, unpadded base64url-encoded JSON. Decoders retain legacy standard-base64
  compatibility; callers must never construct cursors or expose raw database parameters.
- **Limit range**: 1-100, clamped automatically
- **Validation**: Parser ignores invalid filter values (e.g. unsupported `sort` or `time_range`) and falls back to defaults; throws 400 for invalid cursor format or a limit that is not a positive integer
- **Response format**: Always return `{ results: T[], page_info: PageInfo }`
- **Bounded public requests**: every public collection composes a configured limit parser.
  `omitLimit` is an internal service option and is never parsed from a public query string.

## Published Query Metadata

`createPaginationParser()` exposes a typed, read-only `queryContract` alongside `parse()`. The
contract describes the configured cursor name, integer limit bounds/default, and enabled filters.
Search-parameter parsers compose that metadata with their route-specific descriptors through
`withQueryContract()`.

The metadata is descriptive: parsing remains the runtime authority, and a route is included in the
generated OpenAPI query surface only when its handler explicitly calls `apiQuery(...)`. Array
filters are published as comma-separated query values (`style: form`, `explode: false`); the runtime
parser may also retain repeated-key compatibility.

## Cursor Types

- `simple`: `{ id: string }` - For ID-only pagination
- Resource-bound UUID lists use `ScopedSimpleCursor`: `{ id: string, scope: string }`. Encode with
  `encodeScopedUuidCursor()` and decode with `decodeScopedUuidCursor()` so a cursor cannot be
  replayed against another resource, owner, filter set, or ordering. Build `scope` only from
  normalized query inputs, including the ordering mode.
- `score`: `{ score: number, id: string }` - For score-based sorting
- Resource-bound score lists use `ScopedScoreCursor`: `{ score: number, id: string, scope: string }`.
  Decode with `decodeScopedScoreCursor()` to validate the UUID and reject replay against another
  normalized owner, filter set, or order.
- `ranking`: `{ ranking: number, id: string }` - For ranking-based sorting
- `timestamp`: `{ timestamp: number, id: string }` - For time-based sorting
- Resource-bound time lists use `ScopedTimestampCursor`: `{ timestamp: number, id: string,
scope: string }`. Decode with `decodeScopedTimestampUuidCursor()` to validate the UUID and reject
  replay against another normalized owner, filter set, or order.
- `precise_timestamp`: `{ timestamp: string, id: string }` - Canonical UTC microsecond timestamps
  for PostgreSQL keysets whose precision must remain exact
- `name`: `{ name: string, id: string }` - For name+ID composite keys
- `tier`: `{ tier: number, id: string }` - For tier-based sorting
- Resource-bound tier lists use `ScopedTierCursor`: `{ tier: number, id: string, scope: string }`.
  Decode with `decodeScopedTierCursor()` to validate the UUID and reject replay against another
  normalized owner, filter set, or order.
- Resource-bound text-key lists (no surrogate UUID, e.g. a globally-unique text column used
  directly as the sort/tiebreaker key) use `ScopedAliasCursor`: `{ alias: string, scope: string }`.
  Encode with `encodeScopedAliasCursor()` and decode with `decodeScopedAliasCursor()`; build
  `scope` from the same normalized query inputs (filters plus ordering) so a cursor cannot be
  replayed against another owner, filter set, or endpoint.

## API Route Usage

Use `createPaginationParser` to create a configured parser:

```typescript
import { createPaginationParser } from '@modules/pagination'

const parser = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    postTypes: true,
    topicTypes: true,
    timeRange: true,
    sort: ['new', 'best', 'relevance'] as const,
    search: true,
  },
})

// In route handler
const options = parser.parse(ctx.query)
const result = await service(ctx.state.user, options)
ctx.body = { results: result.results, page_info: result.page_info }
```

Use the same parser as both the runtime and metadata owner:

```typescript
apiQuery('GET:/api/v1/items', parser)
```

When a route combines multiple owners, pass each carrier to `apiQuery`; generation rejects duplicate
parameter names instead of silently choosing one.

Route-owned carriers use `defineQueryContract()` with typed descriptors such as `queryString()`,
`queryBoolean()`, `queryNumber()`, `queryInteger()`, and `queryEnum()` for parameters that are not
owned by a pagination parser.

## Service Layer

Services decode cursors and return results with page_info:

```typescript
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'

export async function getItems(options?: { limit?: number; after?: string }) {
  const limit = options?.limit ?? 25

  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  // Fetch limit+1 for pagination detection
  const query = sql`SELECT * FROM items WHERE id > ${cursorId} ORDER BY id LIMIT ${limit + 1}`
  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0 ? encodeCursor({ id: results.at(-1)!.id }) : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0].id }) : null,
    },
  }
}
```
