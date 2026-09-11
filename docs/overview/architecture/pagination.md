# Cross-Surface Cursor Pagination

Cursor pagination is required for every database-backed collection exposed by Voucha. Exemptions
are limited to compile-time/static catalogs and mutation-enforced semantic sets whose hard maximum
cardinality is encoded and tested in backend code. Operationally small tables, current row counts,
and unenforced top-N product expectations are not exemptions.

## API And Query Contract

- Forward pagination uses `after`. Bidirectional admin tables may also use `before`.
- Cursors are opaque, validated, unpadded base64url-encoded JSON. Decoders accept legacy standard
  base64 cursors during migration; callers must not construct or inspect cursor payloads.
- The cursor contains every key in the deterministic keyset order, including a unique ID
  tie-breaker. A continuation predicate uses the same keys and direction as `ORDER BY`.
- Apply visibility, filters, and semantic deduplication before pagination. Preserve those inputs on
  every continuation request and reject a cursor whose encoded query or sort shape is incompatible.
- Relevance-ranked RSS search uses the same rule with a score, microsecond publication timestamp,
  and UUID keyset. Its opaque scope binds normalized semantic query input, effective filters, and
  viewer identity only when a viewer-dependent filter is active.
- UUID-only public cursors whose dataset identity can vary by resource, owner, or filters must carry
  an exact resource scope built from normalized identifiers, filters, and ordering. Reject scoped
  cursors with missing, additional, tampered, or mismatched fields.
- Friend recommendation cursors use the exact
  `{"resource":"my-friend-recommendations","owner_id":"…","order":"id-asc"}` scope. The prelaunch
  migration decoder temporarily accepts the previous simple ID cursor; every newly emitted cursor
  is scoped. Responses to legacy cursors carry `Deprecation: true` so access logs can measure the
  contraction gate; legacy usage must remain at zero for the rollout contraction window.
- Private post relation collections use the same scope binding with a timestamp-and-UUID keyset.
  Resolve comments to their root and apply post type, clearance, audience, and community access in
  SQL before selecting the visible `limit + 1` relation rows.
- Fetch `limit + 1`, return at most `limit`, and derive `has_next_page` from the extra row. A result
  count equal to `limit` does not prove another page exists.
- List responses use `{ results, page_info, ...pageLocalSidecars }`. `page_info` includes accurate
  `has_next_page`, `start_cursor`, and `end_cursor`; bidirectional responses also expose
  `has_previous_page` through their dedicated page-info type.
- `EMPTY_PAGE_INFO` (`backend/api/response-helpers.mts`) is legitimate only where the result set is
  _provably_ empty — an unresolved caller-supplied filter identifier (e.g. `topic`, `similar_post`,
  the `checkShouldReturnEmpty` pattern in `backend/services/search-params/resolve.mts`), or an input
  guard that provably skips the query (web-search's short-query early return). It must never stand
  in for a real, possibly-truncated list; new call sites are allowlisted individually in
  `ast-grep-rules/pagination-empty-page-info-allowlist.yml`.
- Public request parsing must remain bounded. Internal facet/count work may use a purpose-specific
  query, but clients cannot request `omitLimit` or another unbounded mode.
- Comment permalink ancestors are a reverse path traversal rather than a sortable collection:
  bounded `GET /api/v1/posts/:idOrSlug/ancestors?limit=5` pins the true root, shows at most five
  nearest parent hops plus the target, and uses a one-row rootward sentinel for `has_next_page`.
  Its signed cursor binds the target, root, and continuation boundary. `end_cursor` is the
  shallowest displayed non-root item because `after` walks toward the root; `start_cursor` is the
  deepest. The root is the sole intentional duplicate across pages and sidecars are page-local.
  The temporary no-query full-chain response is an expand/contract compatibility path, not a
  public unbounded mode; clients must migrate to `limit=5` before that fallback is removed.

### Messaging Traversal And Query Plans

- Direct-message inbox cursors for `/api/v1/my/messages` contain the exact PostgreSQL microsecond
  activity timestamp and UUID tie-breaker. Chat conversation cursors for
  `/api/v1/my/conversations`, along with thread-message and participant cursors, use an opaque
  simple cursor containing their UUID ID ordering key. All are encoded through the shared cursor
  helpers; raw UUIDs are not valid public cursors.
- Thread history is fetched newest-first with `limit + 1`, then presented chronologically. The
  oldest candidate is the sentinel, so a non-terminal page drops that candidate before returning
  results. `start_cursor` identifies the newest returned message and `end_cursor` the oldest;
  `after=end_cursor` loads the next older window for prepending.
- Support-thread messages retain their same-thread UUIDv7 anchor lookup, then use a
  `(support_thread_id, id)` keyset boundary and query order matching the composite index;
  `created_at` remains a projected generated timestamp, not an ordering key.
- Authorization and visibility constrain the path dataset before its keyset boundary. Replaying an
  otherwise valid cursor on another authorized path only selects a boundary inside that path and
  cannot expose rows from the source path. Clients still reset traversal when the path changes.
- Direct-message inbox queries must scan `idx_conversations__direct_message_updated` in
  `(updated_at DESC, id DESC)` order without an explicit Sort under custom and generic plans.
  Membership uses a correlated scalar probe whose singleton contract is enforced by
  `idx_conv_participants__conversation_user`; decorrelating into a participant-driven join would
  require sorting the inbox after membership lookup and fails the seeded plan gate.

The backend implementation owner is [`@modules/pagination`](../../../backend/modules/pagination/README.md),
which adapts generic cursor primitives from `@vouchington/pagination` to Voucha's snake_case
response and filter contracts.
SQL `OFFSET` remains prohibited by the existing `no-sql-offset` AST-grep rule.

## Client Contract

- Web pages render the complete first response page on the server. Forward-appending browse lists
  use `usePaginatedList` and `InfiniteScroll`, with both automatic intersection loading and a visible
  Load more fallback backed by the same one-flight action. A continuation failure preserves existing
  rows, stops automatic loading, and changes the fallback to an explicit retry for the same cursor.
  Admin tables use URL-restorable Previous/Next controls; reverse message history uses its explicit
  chronological continuation control.
- Debounced autocomplete/typeahead dropdowns that filter results by a client-side exclusion set
  (for example, users already selected as recipients/participants) cannot use `usePaginatedList` —
  there is no persistent list to append to between keystrokes. Instead they issue a bounded
  loop-until-enough-visible-matches request per keystroke: fetch a page, drop excluded IDs, and if
  fewer than the target count remain, follow `page_info.end_cursor` for another page. The loop stops
  on reaching the target count, `has_next_page: false`, or a small fixed page-count safety bound
  (so one debounced keystroke cannot fan out unbounded requests even when exclusions consume many
  consecutive pages). See `web/components/shared/search-users-excluding.ts` for the reference
  implementation. Swift and .NET user-search typeaheads follow the same shape — a private bounded
  loop scoped to each view model/control rather than a shared list-state type, since there is no
  persistent list to append to. This applies even where there is no exclusion set to filter (for
  example a single-select picker), so the leaf call site still reads `page_info` instead of
  truncating at page one. See `DirectMessagesViewModel+Search.swift`'s `matchingUsers`,
  `MembershipGrantViewModel+Search.swift`'s `matchingCandidates`, and
  `NativeMarkdownEditor+Autocomplete.swift`'s `matchingMarkdownUsers` for the Swift reference
  implementations.
- Embedded moderation panels whose target identity changes inside an already-mounted client surface
  may load page one after mount when hoisting the query would duplicate the panel's refresh lifecycle.
  They must show an explicit loading state, reject stale target generations, deduplicate by stable ID,
  and preserve rendered rows with a retryable continuation control after failures.
- Swift and .NET list state forward `page_info.end_cursor`, append by stable entity ID, allow one
  request at a time, reject stale generations after cancellation or filter changes, and preserve
  already-rendered rows when a continuation fails. Swift's Foundation-only and .NET Core's portable
  `CursorPaginationState` implementations own the traversal state, while the SwiftUI and MAUI
  `HybridPaginationControl` implementations keep Load more visible and route viewport continuation
  through the same guarded action.
- Every client resets pagination when a filter or sort changes. Page-local entity maps and sidecars
  merge alongside results rather than being discarded after page one.
- Reverse-traversed message timelines are presented chronologically within each page. For those
  endpoints only, `start_cursor` identifies the newest returned message and `end_cursor` the oldest;
  `after=end_cursor` loads the next older window for prepending. Route tests cover multi-page
  traversal without gaps or duplicates.
- Activity feeds ordered by mutable timestamps (for example, conversation inboxes) retain exact
  keyset traversal for older pages and refresh page one on live/focus updates. Refreshed rows merge
  by stable ID and return to recent-activity order, including threads that moved ahead of an older
  cursor. No-gap guarantees apply within a stable ordering snapshot; refresh semantics reconcile
  rows whose ordering key changes during traversal.

## Verification

Backend tests cover empty, partial, exact-limit, multi-page, tie-key, malformed-cursor, filter,
forward, and backward cases without duplicates or gaps. Client tests cover server-rendered page one,
cursor forwarding, append/deduplication, one in-flight request, cancellation, retry, and failure
preservation. New composite keysets require seeded `EXPLAIN` evidence for the matching access path.

The shared `forward-pagination`, `forward-pagination-cancellation`, and private-post collection
families in [`lifecycle-scenarios.json`](../../../api-fixtures/v1/lifecycle-scenarios.json) provide
stable cross-client IDs for the race, continuation, filtering, and removal cases.

The AST-grep pagination rules intentionally detect only narrow known foot-guns: legacy public
`cursor` parameters, public `omitLimit`, reintroduction of the removed `toListResponse` helper,
inline `page_info: EMPTY_PAGE_INFO` outside its allowlisted provably-empty sites, and exact-limit
`has_next_page` calculations. They do not prove keyset correctness or UI continuation; shared
implementations and behavioral tests own those semantic guarantees. Known gap: a hand-rolled literal
`{ has_next_page: false, end_cursor: null, start_cursor: null }` bypasses the
`pagination-empty-page-info-allowlist` rule, since it matches only the named `EMPTY_PAGE_INFO`
export — prefer the named export at every genuinely provably-empty site so the guard applies.

## Related Guidance

- [Root repository rules](../../../CLAUDE.md)
- [Backend rules](../../../backend/CLAUDE.md) and [API route rules](../../../backend/api/CLAUDE.md)
- [Web rules](../../../web/CLAUDE.md) and [route requirements](../../requirements/navigation/ROUTES.md)
- [User settings workflows](../../requirements/users/USER_SETTINGS.md)
- [native client rules](https://github.com/vouchington/vouchington-clients), and
  [native parity checklist](../../checklists/native-parity-interactions.md)
