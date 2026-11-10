# Cross-Surface Cursor Pagination

Cursor pagination is required for every database-backed collection exposed by Voucha. Exemptions
are limited to compile-time/static catalogs and mutation-enforced semantic sets whose hard maximum
cardinality is encoded and tested in backend code. Operationally small tables, current row counts,
and unenforced top-N product expectations are not exemptions.

The landing-page picker keeps an owner-ordered projection of its distinct source types so one
keyset walk can preserve their combined order. Source writes maintain it atomically; reads check
eligibility against current source rows.

## Runtime Page Limits

`pagination-config` owns runtime defaults and effective maxima. Pure parsers receive numeric
bounds from the API, service or tool adapter; their request contracts retain static
ceilings. A configured default above the effective maximum is clamped to that maximum.
Invalid configuration falls back to a validated default within the static ceiling.

The common 100-row profile uses `max_limit`. Existing 25-, 50- and 200-row exception profiles
have independent configured maxima, preserving their advertised range. Existing route-default
profiles remain distinct; anonymous search is additionally bounded by `anonymous_max_limit`.
Clients follow `page_info` and opaque cursors even when a configured page is shorter than their
requested limit. See [client coordination](../../requirements/CLIENT-PARITY-MATRIX.md).

## API And Query Contract

- Forward pagination uses `after`. Bidirectional admin tables may also use `before`.
- Cursors are opaque, validated, unpadded base64url-encoded JSON. Decoding rejects padding and
  the standard base64 alphabet. Callers must not construct or inspect cursor payloads.
- The cursor contains every key in the deterministic keyset order, including a unique ID
  tie-breaker. A continuation predicate uses the same keys and direction as `ORDER BY`.
- Apply visibility, filters, and semantic deduplication in `WHERE` before the final ordered
  keyset limit. Membership-ordered lists (saved posts, personal lists, community lists, entity
  relations) walk the membership index and join the targets with eligibility in WHERE; they do not
  page raw memberships and discard targets afterward. Saved posts and list items have no write cap
  (#4979), so the keyset walk, not a write limit, bounds each page. A nonterminal page is full and
  its cursor names the last returned row; a page is short only at the end, except under an
  inspected-row cap (below). Small viewer-scoped sets
  may be subqueries or semijoins. Preserve filter inputs on every continuation request and reject a
  cursor whose encoded query or sort shape is incompatible.
- Relevance-ranked RSS search uses the same rule with a score, microsecond publication timestamp,
  and UUID keyset. Its opaque scope binds normalized semantic query input, effective filters, and
  viewer identity only when a viewer-dependent filter is active.
- UUID-only public cursors whose dataset identity can vary by resource, owner, or filters must carry
  an exact resource scope built from normalized identifiers, filters, and ordering. Reject scoped
  cursors with missing, additional, tampered, or mismatched fields.
- Post-search hot and trending ranks use a fixed epoch, keeping order stable across requests
  when vote scores are unchanged. Future timestamps participate in the rank; near ties can differ
  from an age-decayed calculation. Their opaque cursor binds that ordering.
- Personalized post feeds inspect a bounded delivery prefix before applying post visibility and
  feed filters. A short or empty page can still have `has_next_page`; the cursor advances over
  inspected deliveries so later eligible posts and shares remain reachable, including more shares
  for the same post. REST and MCP clients continue with the returned `end_cursor` and preserve the
  feed filters until `has_next_page` is false.
- Post search inspects a bounded index-ordered prefix before applying visibility and other residual
  filters. A short or empty page can have `has_next_page` true; clients continue with its cursor.
  Newest topic searches use that same inspected-key walk, checking membership against each post
  rather than collecting all posts across the topic's aliases. Sparse topics can therefore need
  several continuation requests before returning a match.
  Following-first search exhausts the followed phase before scanning the remaining authors, using
  the viewer’s follow set as a subquery. Keyword relevance ranks only within each bounded newest-first
  cohort. Its opaque cursor carries the cohort boundary and rank/ID position, so older posts enter
  the next cohort rather than disappearing beyond the cap. Relevant posts in newer cohorts precede
  higher-scoring posts in older cohorts. Data-point best sorting with a topic filter also ranks only
  inside bounded newest-first topic cohorts. A higher-scoring older post can therefore appear in a
  later cohort. Its cursor retains the cohort boundary, score and ID until that cohort is exhausted,
  then advances to older topic keys; posts beyond the cap remain reachable. Resolved semantic search
  retains its finite vector window.
- Hacker News hot search fixes a bounded newest-first cohort before checking eligibility and ranking
  by hot score. Continuations stay inside that cohort; older posts outside it do not enter later
  pages. A sparse eligible subset can therefore end before filling a page.
- Friend recommendation cursors use the exact
  `{"resource":"my-friend-recommendations","owner_id":"…","order":"id-asc"}` scope. Unscoped
  simple ID cursors are rejected.
- Private post relation collections use the same scope binding with a timestamp-and-UUID keyset.
  The page uses the live relation keyset. Post type, clearance, audience, and community access are
  eligibility predicates in the same walk, applied before the ordered limit.
- Fetch `limit + 1`, return at most `limit`, and derive `has_next_page` from the extra row. A result
  count equal to `limit` does not prove another page exists.
- Inspected-row cap: a filtered walk that caps the rows it inspects may return a short or empty
  page that is still nonterminal. Its cursor names the last inspected row, not the last returned
  row, and `has_next_page` is true while the walk has not reached the end of the index. Clients
  treat such a page as "load more", not as the end.
- List responses use `{ results, page_info, ...pageLocalSidecars }`. `page_info` includes accurate
  `has_next_page`, `start_cursor`, and `end_cursor`; bidirectional responses also expose
  `has_previous_page` through their dedicated page-info type.
- `EMPTY_PAGE_INFO` (`backend/api/response-helpers.mts`) is legitimate only where the result set is
  _provably_ empty — an unresolved caller-supplied filter identifier (e.g. `topic`, `similar_post`,
  the `checkShouldReturnEmpty` pattern in `backend/services/search-params/resolve.mts`), or an input
  guard that provably skips the query (web-search's short-query early return). It must never stand
  in for a real, possibly-truncated list; new call sites are allowlisted individually in
  `ast-grep-rules/pagination-empty-page-info-allowlist.yml`.
- Web search ranks only the top `web-search-config.chunk_cap` chunks (DynamicConfig, hard max in
  code), keeps the best chunk per URL, then pages that set. Its cursor is scoped to the query and
  tiered: content rows by `(rank, url id)` descending, then URL-string-only matches by URL id. A URL
  whose only content match falls below the cap surfaces as a URL match, and a page ends short only
  at the end of a tier.
- Public request parsing must remain bounded. Internal facet/count work may use a purpose-specific
  query, but clients cannot request `omitLimit` or another unbounded mode.
- Comment permalink ancestors are a reverse path traversal rather than a sortable collection:
  bounded `GET /api/v1/posts/:idOrSlug/ancestors?limit=5` pins the true root, shows at most five
  nearest parent hops plus the target, and uses a one-row rootward sentinel for `has_next_page`.
  Its signed cursor binds the target, root, and continuation boundary. `end_cursor` is the
  shallowest displayed non-root item because `after` walks toward the root; `start_cursor` is the
  deepest. The root is the sole intentional duplicate across pages and sidecars are page-local.
  A request with no paging parameters gets the same default window; there is no unbounded mode.
  `read_posts` option `ancestors` pages the same way over MCP. REST and MCP read a reply when it
  and the thread root pass; no ancestor in between can hide it. A deleted or unmoderated ancestor
  comes back as a placeholder (`placeholder_state`, no text or author) instead of a 404.

Comment descendants page inspected immediate-child heads and attach bounded previews. Each
response orders its returned ids, but continuation is by head rather than by every descendant id.
Unlike a visible-row collection, placeholder filtering may leave a short or empty page with a
cursor: `end_cursor` identifies the last inspected head, not necessarily a returned row. Continue
while `has_next_page` is true. It describes more heads, not complete previews; opening a returned
comment through the same descendants operation reaches replies beyond its preview budget. REST
and MCP share cursor parsing, runtime limit bounds and this ordering contract.

**Known, accepted gap:** The best-effort `end_cursor` can identify the last inspected row even
when it was filtered out as hidden, deleted, blocked or otherwise ineligible. Decoding the opaque
cursor can reveal that such a row exists and its sort key (such as an ID or timestamp), but not its
content.

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
- Authorization and visibility constrain the path dataset before its keyset boundary. Replaying an
  otherwise valid cursor on another authorized path only selects a boundary inside that path and
  cannot expose rows from the source path. Clients still reset traversal when the path changes.
- Direct-message inbox queries must scan `idx_conversations__direct_message_activity` in
  `(last_activity_at DESC, id DESC)` order without an explicit Sort under custom and generic plans.
  Membership uses a correlated scalar probe whose singleton contract is enforced by
  `idx_conversation_participants__conversation_user`; decorrelating into a participant-driven join would
  require sorting the inbox after membership lookup and fails the seeded plan gate.

The backend implementation owner is `@modules/pagination`,
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

## RSS timestamp precision and scope

RSS feed delivery and recency-search cursors use the existing scoped precise timestamp/UUID
primitives from `@modules/pagination`. PostgreSQL projects UTC microsecond text only for the bounded
response page; cursor predicates compare that text directly as `timestamptz`. Public timestamps
remain dates and cursors remain opaque strings. Numeric timestamp and `share:`-prefixed historical
payloads are rejected under the current prelaunch contract.

The public posts RSS document uses the same inspected-key continuation as post search. A short or
empty document can still have more candidates; its Atom `rel="next"` link carries the opaque
`after` cursor and preserves the feed filters. RSS generation does not scan additional pages to fill
the current document.

Feed cursors include the direct/share tier and bind the viewer, administrator context, community,
feed type, time range, score thresholds and effective filters. Recency cursors separately bind their
resource/order, viewer/access and filters. Both normalize unordered arrays and effective defaults,
trim text exactly as SQL does, and exclude page size. Feed, recency and semantic cursors cannot be
replayed across each other's resource/order. Semantic relevance pagination keeps its existing
precise ranking cursor. Owners:
[feed](../../../backend/services/feeds/rss-feed-items/cursor.mts),
[recency](../../../backend/services/rss-feed-items/search-cursor.mts), and
[semantic](../../../backend/services/rss-feed-items/search-semantic-cursor.mts).

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

- [Root repository rules](../../../AGENTS.md)
- [Backend rules](../../../backend/AGENTS.md) and [API route rules](../../../backend/api/AGENTS.md)
- [Web rules](../../../web/AGENTS.md) and route requirements
- [User settings workflows](../../requirements/users/USER_SETTINGS.md)
- [native client rules](https://github.com/vouchington/vouchington-clients), and
  [native parity checklist](../../checklists/native-parity-interactions.md)
