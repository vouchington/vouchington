# Fediverse Federation reference

[Back to Fediverse Federation](fediverse-federation.md)

## Constraints that bind every phase

- New `topic_type` must **justify itself** with type-specific behavior (extension table, validation,
  and routing) — `fediverse_instance` qualifies (software/protocol/NodeInfo metadata, instance-specific
  routing/filtering, integration decision). Adding it triggers the
  [Finite Enum Ripple Checklist](../../development/finite-enum-ripple-checklist.md).
- Pre-launch: **edit migrations in place**; no new ALTER-TABLE migrations for the enum/columns.
- External calls: `/* no-mistakes: integration=<provider> */`, `undici` +
  `@modules/utils/http-dispatchers` (or SSRF-safe `@modules/utils/http`), **queued** (no for-loop /
  `Promise.all` fan-out of external calls) — Phase A's request-path search is the documented exception;
  see below.
- The product `fediverse` flag is **frontend-only**; backend routes stay mounted. Separate
  DynamicConfig rollout flags choose direct versus HTTP CONNECT proxy transport without changing
  the public contracts.
- Secrets (AP private keys, Bluesky OAuth tokens) go through `@modules/token-secrets`; never persist
  raw.
- **Client parity**: every user-facing surface moves web + Swift + .NET + `api-fixtures/v1` together.
- Append-only moderation/toggle state (the integration allowlist): history rows + trigger-maintained
  denormalized status; never update in place, no "one active row" unique index.

## Phase A — Real inbound search (all four platforms, + Lemmy) — Shipped

Fills the previously-empty `EMPTY_ADAPTERS` stub in `backend/services/fediverse-search/search.mts` so
`GET /api/v1/fediverse/search` returns real external links. It stays search-first and persists
nothing. High-level search always runs in the API;
`api-egress-proxy.fediverse_search_enabled` selects direct or HTTP CONNECT proxy transport for
controlled egress rollout without changing its response.

- **Adapter factory + DI.** A new adapter factory is wired through the DI seam that already exists in
  `searchFediverse(options, adapters)` — see the [reuse-mapping table](reference-fediverse-federation-protocol-reality.md#how-the-existing-model-maps-reuse-targets) for the primitives the
  per-provider adapters build on (PeerTube, Mastodon, Lemmy, Bluesky), each a pure fetch + pure mapper
  pair.
- **Adds Lemmy as a fourth provider**, which touches every hardcoded three-provider list (web types,
  `search.mts`'s default-provider list, native allowlists) — run the
  [Finite Enum Ripple Checklist](../../development/finite-enum-ripple-checklist.md) before the first
  push.
- **Cursor contract fix.** Today `search.mts` forwards one incoming cursor to every provider even
  though cursors are provider-specific — a real defect, fixed in this phase (forward the cursor only
  for single-provider searches; ignore the incoming cursor and return each bucket's own `next_cursor`
  for "All"). There is no multiplexed cursor across providers: a client paginating past page one of an
  "All" search switches to a single-provider request using that bucket's own `next_cursor`.
- **Inline `Promise.all` fan-out is intentional here, not a rule violation.** The "no external calls in
  a loop" constraint above targets unbounded fan-out; this is a fixed ≤4-provider fan-out on a request
  path that must return in one response, guarded by per-provider timeouts, an overall deadline, and the
  existing per-provider bucket isolation. Trusted-content ingestion — a separate, still-deferred piece
  of work — is where per-item work would move to a queue instead.
- Instance classification does **not** land in this phase: an `instance-classification.mts` helper
  with no caller yet (all four adapters short-circuit `result_type:'instance'` to an empty bucket,
  each asserted by a passing test) would be dead code. It moves to Phase B, built alongside the
  directory that actually calls it — see below.

## Phase B — Instance directory (`fediverse_instance` topic type, voting, admin allowlist) — Shipped

Opens with the **instance-classification helper** (`adapters/instance-classification.mts` in
`fediverse-search`): reads remote NodeInfo (`/.well-known/nodeinfo` → `/nodeinfo/2.0`) for the
configured hosts — an inbound **read**, distinct from _serving_ NodeInfo/WebFinger, which stays out
of scope until Phase C reverses that boundary (SSRF-safe: config hosts only in v1, same 4
`FEDIVERSE_*_HOST` constants the search adapters already use). It is the metadata input for the rest
of this phase, mirroring the existing **source** pattern in the [reuse-mapping table](reference-fediverse-federation-protocol-reality.md#how-the-existing-model-maps-reuse-targets):
`topic_type='rss_feed'` + `rss_feeds` extension table, voted the same way a source is.

Instance creation uses the same `api-egress-proxy.fediverse_search_enabled` transport flag for its
NodeInfo classification call. Both search and classification remain in the API; their outbound HTTP
uses the proxy only when the flag is true.

- **New `topic_type='fediverse_instance'`** plus a 1:1 extension table, edited into the existing
  taxonomy migration in place (pre-launch convention — no new ALTER-TABLE migration). Adding a topic
  type is a closed-string-set change; run the
  [Finite Enum Ripple Checklist](../../development/finite-enum-ripple-checklist.md) — this one touches
  runtime maps, i18n, generated tests, and `repo-file-policy`.
- **Voting reuses existing elections** — topic vote and hostname trust badge, per the
  [reuse-mapping table](reference-fediverse-federation-protocol-reality.md#how-the-existing-model-maps-reuse-targets). No new vote tables or endpoints; any new vote schema goes through the config-driven
  generators, never hand-written.
- **Admin allowlist is append-only history + a sync trigger**, the same pattern as
  `rss_feed_enablement_changes` → `is_enabled`: every integration decision is an inserted row, never an
  update-in-place, and a denormalized `integration_status` column is trigger-maintained from the latest
  row. The allowlist is advisory by default — it does not block anything until Phase C's outbound
  integration exists.
- Any signed-in user can add an instance to the directory; the owner controls integration via the
  allowlist, not creation.
