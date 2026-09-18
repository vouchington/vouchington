# Fediverse Search

Fediverse support began as a search-first aggregator surface. A four-phase roadmap (below) turns it
into a real federation participant, one phase at a time; the `Status` column reflects what has
actually shipped. As of Phase C, Voucha also participates in protocol federation: Voucha users are
ActivityPub actors that remote Mastodon/Lemmy/PeerTube users can discover, follow, and send likes
to. Voucha sends social activities to existing remote followers, but does not let a local user
directly follow or like an arbitrary remote target (see
[Current boundaries](#current-boundaries) below).

## Current state

- `GET /api/v1/fediverse/search` provider adapters run real per-provider search
  (`backend/services/fediverse-search/adapters/{peertube,mastodon,lemmy,bluesky}.mts`) — every
  search live-queries all four upstream platforms; nothing is persisted. Search and instance
  NodeInfo classification run in the API; `api-egress-proxy.fediverse_search_enabled` selects
  direct or HTTP CONNECT proxy transport for their outbound requests during controlled rollout.
- Providers are `peertube | mastodon | lemmy | bluesky` (`web/types/fediverse-search.ts`).
- `/instances` is the instance-directory entry point Phase B builds — a `fediverse_instance` topic
  type under the standard `(topics)` route tree, not a page under `/fediverse/`. Every other topic
  type's list/detail pages live at `(topics)/<plural>/` and `(topics)/<singular>/[id]/**`
  (`route-completeness.test.mts` enforces the `(topics)/instance/[id]/**` detail shape); `/instances`
  follows that exceptionless convention instead of the `/fediverse/instances` path the original
  roadmap sketch used. The old `/fediverse/instances` placeholder page was removed in the same PR.

## Scope

- The `fediverse` feature flag gates web and native visibility. Backend APIs stay mounted. The
  `/instances` list and `/instance/[id]/**` detail pages gate on the flag individually (list page,
  detail layout) since they sit outside the `/fediverse/` route group.
- `/fediverse` searches provider buckets for PeerTube, Mastodon-compatible servers, Lemmy, and Bluesky.
- `/instances` is the instance-directory entry point. Instance trust uses hostname/domain signals.
- `/videos` may link to PeerTube discovery when the flag is enabled.

## Client UI boundary

Web, Swift, and .NET render the live `/instances` directory and `/instance/:idOrSlug/**` detail
tree. All three clients consume the dedicated public instance contract, show normalized software,
protocol, usage, registration, and hostname-trust metadata, and retain generic topic voting,
follow, and mute actions. Native Fediverse search also exposes visible All, PeerTube, Mastodon,
Lemmy, and Bluesky provider filters with canonical route state.

The per-user `fediverse_federation_enabled` opt-in is persisted and transported in account models,
but no client currently renders a control for it. It is therefore not a cross-client parity gap;
adding its first UI is product work that must update the parity contract when a reference surface
exists. Instance submission and integration-status administration likewise have no rendered web
workflow today and are outside the client parity gap set.

## Phased Roadmap

| Phase | Status  | Description                                                                                                                                                     |
| ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Shipped | Real inbound search across PeerTube, Mastodon, Bluesky, and Lemmy — live-queried, nothing persisted.                                                            |
| B     | Shipped | Instance directory: new `fediverse_instance` topic type, community voting (topic vote + hostname trust badge), owner admin allowlist for integration decisions. |
| C     | Shipped | Outbound ActivityPub: Voucha users are AP actors first (follow/like only); per-user opt-in, default off. Resurrects and replaces the removed federation server. |
| D     | Shipped | Bluesky OAuth account-linking and follow/unfollow propagation. Voucha does not publish posts to Bluesky, so generic Bluesky likes are not supported.            |

Full technical design: [Fediverse Federation architecture](../../overview/architecture/fediverse-federation.md).

## Current boundaries

- **ActivityPub inbox: implemented.** `POST /ap/inbox` is one shared inbox. With the default-false
  `activitypub-inbox.async_delivery_enabled` flag, it preserves synchronous actor fetch, signature
  verification, replay deduplication, dispatch, and exact legacy statuses. That synchronous fetch
  runs in the `api` process itself and requires the sender's actor host to be reachable from there —
  see the "Ordering gate — ActivityPub inbox IPv4-only actor reachability" section of the phase-4
  SSM parameter store checklist in the private `vouchington-infra` repository for the IPv6-only
  cutover's reachability requirement. When enabled, the API
  performs network-free preflight, verifies a cached signer locally when one exists (rejecting
  invalid signatures before any durable row), persists the exact raw signed envelope in
  `ap_inbox_deliveries`, awaits the initial enqueue attempt, and returns `202` once PostgreSQL is
  durable. The I/O worker fetches unknown actors, verifies freshness relative to receipt time, checks the
  signed actor, applies sender limits when the row is not already admitted, and deduplicates/dispatches `Follow`/`Undo(Follow)` onto the
  remote-origin bookmarks relation and `Like`/`Undo(Like)` onto the isolated
  `ap_posts`/`ap_post_likes` ledger, never `post_votes`. Five-minute recovery repairs lost/stale
  queue work, manual backfill re-arms exhausted operational failures, and final outcomes delete the
  pending raw envelope. Unverified envelopes retain at most one hour and share hard global caps of
  10,000 rows and 256 MiB of exact raw-body bytes; a full unverified store returns `503` with
  `Retry-After: 300`, while already-verified cached signers remain admissible. Operational failures
  retain at most seven days from their immutable first failure. Five-minute, lease-aware cleanup
  deletes expired rows in bounded batches. A typed lifecycle facade owns all fenced delivery
  transitions; the dedup
  reservation, core effect, and envelope completion commit atomically, with only Follow Accept
  enqueueing after commit. There is no queryable AP **outbox** collection endpoint; outbound
  delivery remains push-based through its separate queue.
- **Federation delivery queues: implemented.** `@queues/activitypub-delivery` +
  `@workers/activitypub-delivery` fan a local follow/like out to the acting user's remote followers.
  Each activity has a durable PostgreSQL fan-out cursor: strict remote-actor keyset pages contain
  at most 500 recipients, commit only after Valkey accepts their distinct inbox jobs, and hand off
  one ordered continuation so large distributions yield between pages. Eligibility is evaluated on
  each page: active followers are included unless their instance is currently explicitly blocked;
  unreviewed instances remain eligible. The cursor is at-least-once progress only, not a per-inbox
  receipt: an enqueue/commit crash window can replay a page, remote HTTP delivery can duplicate,
  and a Valkey wipe cannot be recovered from durable fan-out state.
  Known Follow relation and Like vote generations retain stable outbound identities: retries reuse
  them, re-follow/re-like rotate them, and Undo embeds the exact original ID. Legacy Follow/Like
  generations whose delivered ID predates tracking do not emit an ActivityPub Undo. A legacy Follow
  deletion still reconciles Bluesky from current relation state. Pre-upgrade queued Undo jobs
  missing the original ID are terminally discarded before federation checks, key access, fan-out,
  or delivery. See the
  [delivery queue contract](../../../backend/queues/activitypub-delivery/README.md).
- **WebFinger and NodeInfo: implemented.** `GET /.well-known/webfinger`, `GET /.well-known/nodeinfo`,
  and `GET /nodeinfo/2.0` are served.
- **Bluesky account linking and follows: implemented.** Linked Voucha users can propagate a local
  user-to-user follow when both sides have linked Bluesky accounts. Voucha does not publish its
  posts into Bluesky, so it has no AT URI/CID strong reference and cannot create a valid generic
  `app.bsky.feed.like` record.
- **No Mastodon-compatible local API.** Phase C implements the raw ActivityPub protocol only (the
  routes above); a Mastodon-API-compatible REST surface for third-party Mastodon apps is a distinct,
  separate piece of work that is out of scope and not currently planned.
- **No federated publishing for reviews or data points — permanent**, not reversed by Phase C or any
  later phase: outbound publishing stays social-actions-only (follow/like). Posts, reviews, and data
  points are never published as ActivityPub objects — this is a confirmed owner decision.

`backend/api/v1/fediverse/__tests__/federation-removal.test.mts` reflects this split: the old
`/api/v1/activitypub/*` namespace, a Mastodon-compatible REST API, and a per-actor inbox/outbox shape
still assert `404`, while WebFinger and NodeInfo now assert they serve.

## Persistence boundary

Fediverse **content** — remote posts, videos, profiles, and statuses — is never persisted; it stays
live-queried on every search. Only federation **state** is stored: follows, likes, AP actor keys,
verified inbox-dedup references, temporary unverified inbox envelopes awaiting a final outcome,
Bluesky linked-account tokens, and instance-directory rows and votes.

Federation follows Voucha **users** as AP actors first (people), not sources or topics. See the
[Fediverse Federation architecture](../../overview/architecture/fediverse-federation.md#protocol-reality)
doc for why.

## Provider Contract

`GET /api/v1/fediverse/search` returns `{ buckets }`, grouped by provider. Each bucket reports
`provider`, `status`, `items`, optional `next_cursor`, and optional `error_code`. Provider failures
must degrade into that provider's bucket instead of failing the whole response.

## Related

- API route: [backend/api/v1/fediverse/README.md](../../../backend/api/v1/fediverse/README.md)
- Search architecture: [../../overview/architecture/search.md](../../overview/architecture/search.md)
- Federation roadmap and design: [../../overview/architecture/fediverse-federation.md](../../overview/architecture/fediverse-federation.md)
- Staging interoperability runbook: [../../operations/fediverse-staging-interop.md](../../operations/fediverse-staging-interop.md)
- Navigation: [../navigation/NAVIGATION.md](../navigation/NAVIGATION.md)
- Client parity: [../CLIENT-PARITY-MATRIX.md](../CLIENT-PARITY-MATRIX.md)
