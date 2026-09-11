# Fediverse Search API

Search-first discovery for Fediverse-adjacent providers, plus the fediverse instance directory
(topic type `fediverse_instance`: user-suggested instances, voting, and admin allowlisting). All
endpoints are always mounted; the `fediverse` feature flag gates frontend visibility only.

## Endpoints

- `GET /api/v1/fediverse/search`
  - Query: `q`, `providers=peertube,mastodon,lemmy,bluesky`, `type=video|post|profile|instance`,
    `limit`, `after`
  - Response: `{ buckets: [...] }`, grouped by provider with `ok`, `partial`, or `error` status.
  - `after` accepts the opaque `next_cursor` returned by a prior bucket and is forwarded internally
    to the upstream provider only when exactly one provider is requested; multi-provider ("All")
    searches ignore an incoming continuation value but each bucket still returns its own
    `next_cursor` for follow-up single-provider pagination. A non-string or repeated `q`
    (`?q=a&q=b`) is rejected with 422 `Invalid q`. An empty `q=` is treated as an empty result.
    A non-string or repeated `after` (`?after=a&after=b`) is rejected with 422 `Invalid after`.
    An empty `after=` is treated as the first page.
  - `api-egress-proxy.fediverse_search_enabled` selects the outbound HTTP transport at request time.
    Search always executes in the API process; when enabled, provider requests use the configured
    HTTP CONNECT proxy and fail closed if the proxy is unavailable.

- `GET /api/v1/fediverse/instances`
  - Query: `q`, `sort=new|best|relevance`, `limit`, `after` (opaque cursor), `software`, `open_registrations`,
    `integration_status=pending|approved|blocked`. The `integration_status` filter is admin-only;
    anonymous and non-admin callers receive `403` when they supply it. The unfiltered directory
    remains public.
  - Response includes `results`, `page_info`, `topics`, `topics_metrics`, `markdown_to_html`,
    `fediverse_instances`, `topic_elections`, and `hostname_elections`, plus `bookmarks` and
    `election_votes` (empty for anonymous callers). All entity sidecars are id-keyed and batch-loaded;
    `fediverse_instances` contains
    `topics__fediverse_instances` rows, present only for ids that have a row (a topic may exist
    without one — see [the anatomy doc](../../../../docs/requirements/anatomy/fediverse-instance.md#data-model)).
  - Anonymous callers are clamped to `ANON_MAX_LIMIT` (25) via `clampAnonLimit`; authenticated
    callers may request up to 100. Caller-supplied `omitLimit` is ignored for every caller.

- `POST /api/v1/fediverse/instances`
  - Body: `{ hostname }`
  - Mirrors RSS's create-or-upvote pattern: creates a new `fediverse_instance` topic and returns
    `201` with `{ status: 'created', topic_id, topic_slug }`, or — if an active instance topic
    already exists for the hostname (including a concurrent-creation race) — upvotes its topic
    election and returns `200` with `{ status: 'upvoted', topic_id, topic_slug }`. Any authenticated,
    non-suspended user may call this; subject to `fediverse_instance` contribution-gating limits.
  - Best-effort classifies the hostname through the same provider transport flag at creation time (see
    [the anatomy doc](../../../../docs/requirements/anatomy/fediverse-instance.md#data-model) for
    which hosts that currently covers) — a classification failure never fails the request.

- `GET /api/v1/fediverse/instances/:id`
  - `:id` accepts either a topic UUID or slug. Response:
    `{ topic, fediverse_instance, topic_election, hostname_election }`. `fediverse_instance` is `null` when
    the topic has no `topics__fediverse_instances` row yet.
  - `404` when `:id` does not resolve to a topic, or resolves to a topic whose `topic_type` is not
    `fediverse_instance`.

- `POST /api/v1/fediverse/instances/:id/integration-changes`
  - Body: `{ integration_status: 'pending' | 'approved' | 'blocked', reason? }`
  - Admin-only (`currentUserCanModifyFediverseInstanceIntegrationStatus`); `403` for any other
    caller, `404` for a non-`fediverse_instance` topic. Appends a row to
    `fediverse_instance_integration_changes`; a DB trigger re-derives the denormalized
    `topics__fediverse_instances.integration_status` from the latest row.
  - Voting on the instance itself reuses the generic topic/hostname election vote routes — there is
    no dedicated vote endpoint here.

## Performance

- **`GET /search`**: one service call from the route, executed in the API. The service fans out to
  requested provider adapters in parallel. Each
  provider call is isolated: a throw or an overall-deadline timeout degrades only that provider's
  bucket to `status: 'error'` without failing the rest of the response. Each provider fetch carries
  its own ~4s timeout; the whole fan-out is additionally capped by an overall ~5s deadline so no
  single slow adapter can stretch the response indefinitely. Cache: each provider adapter is
  wrapped in a short-TTL Valkey cache keyed by `(provider, query, type, limit, internal cursor)`, applied for
  all callers. Anonymous responses also set the standard short public cache header, but only when
  every returned bucket is `status: 'ok'` — a `partial`/`error` bucket skips the header so a shared
  HTTP cache can't replay a degraded response to later anonymous callers.
- **`GET /instances`**: one topic-id search call (cached search wrapper for anonymous callers, live
  for authenticated callers), then batched topic, metric, instance, topic-election,
  hostname-election, markdown, and optional personalization fetches — no per-row queries.
  Anonymous responses set the standard
  short public cache header.
- **`POST /instances`**: one hostname resolve, one dedup lookup, and — on the non-duplicate path —
  one transactional topic+extension insert plus one best-effort NodeInfo classification call before
  the insert. Classification runs in the API and uses the selected direct or proxy dispatcher.
  Proxy transport failure does not fall back to direct network I/O and leaves metadata
  unclassified. Not cached; this is a mutation.
- **`GET /instances/:id`**: one cached topic lookup, then the single-id attribute getter and the
  single-id election batch getter in parallel. Anonymous responses set the standard long public
  cache header (instance detail pages change less often than the search-driven list).
- **`POST /instances/:id/integration-changes`**: one cached topic lookup, then one write through
  `setIntegrationStatusAsAdmin` (a single insert; the denormalized status column is trigger-
  maintained, not written by this route). Not cached; this is a mutation.

## Roadmap

A four-phase plan: Phase A (real inbound search across PeerTube, Mastodon, Lemmy, and Bluesky —
implemented above) is followed by the shipped instance directory + voting, outbound ActivityPub,
and Bluesky account-linking with follow propagation. See
[FEDIVERSE.md](../../../../docs/requirements/content/FEDIVERSE.md) for the phased roadmap and
[the architecture doc](../../../../docs/overview/architecture/fediverse-federation.md) for the
technical design.
