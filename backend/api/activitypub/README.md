# ActivityPub Inbound Receiver

Server-to-server ActivityPub endpoints for Phase C2 of federation: WebFinger and NodeInfo
discovery, actor documents, and the shared inbox. All four endpoints are anonymous/public — none
of them carry a Voucha session, so they skip `response-helpers.mts`'s session-auth preamble by
design (see the doc comment at the top of each route file). See
[the architecture doc](../../../docs/overview/architecture/fediverse-federation.md) for the full
phased design and [FEDIVERSE.md](../../../docs/requirements/content/FEDIVERSE.md) for current-state
boundaries.

Federation is per-user opt-in (`users.fediverse_federation_enabled`, default off). A user who has
not opted in has no reachable actor document, aliases, or WebFinger entry — every route below
gates on `isFederationEnabledForUser` and returns `404` for an opted-out or nonexistent user.

## Endpoints

- `GET /.well-known/webfinger?resource=acct:<username>@<hostname>`
  - Resolves a WebFinger `acct:` handle to this app's actor URI. `404` when `hostname` is not this
    app's own host, the username doesn't resolve to a user, or that user hasn't opted into
    federation. Response: `application/jrd+json`,
    `{ subject, aliases: [actorUri], links: [{ rel: 'self', type: 'application/activity+json', href: actorUri }] }`.
  - `username` is the only federation-facing surface where a username (rather than a userId)
    appears — see `@modules/activitypub-uris`'s `webfinger.mts` doc comment.

- `GET /.well-known/nodeinfo`
  - NodeInfo discovery document: `{ links: [{ rel: <schema 2.0 rel>, href: <.../nodeinfo/2.0> }] }`.

- `GET /nodeinfo/2.0`
  - NodeInfo 2.0 document describing this instance: `software`, `protocols: ['activitypub']`,
    `openRegistrations`, and `usage.users.total` (via `getTotalUserCount`). Shaped to match what
    `@services/fediverse-search`'s Phase B classifier already expects when _reading_ other
    instances' NodeInfo — this route is the reverse (serving) direction.

- `GET /ap/users/:userId`
  - Actor document (`type: 'Person'`) for a federation-enabled user. `:userId` is a UUID; actor
    identity is UUID-only, never username-based (see `@modules/activitypub-uris`'s `actor-uris.mts`
    doc comment) — `preferredUsername` is intentionally absent. `inbox` and
    `endpoints.sharedInbox` both point at the one inbox this app implements (`/ap/inbox`);
    `outbox`/`followers`/`following` are advertised per the required `Person` shape but their
    collection endpoints are not yet built (Phase C4+). `publicKey.publicKeyPem` comes from
    `getOrCreateActorKeyPair`, which lazily generates and persists a keypair on first fetch.
    Response: `application/activity+json`.

- `POST /ap/inbox`
  - Shared inbox for all federation-enabled users. Authenticates each request via HTTP Signatures
    (`@modules/http-signatures`) against the signing actor's cached (or freshly-fetched)
    `publicKeyPem` — there is no session or `x-cf-worker-secret` gate on this route beyond what
    every route already gets from `app.mts`'s guard chain.
  - Control flow: parse `Signature`/`Digest`/`Date`/`Host` headers (`401` if any is missing) →
    derive the claimed sender hostname from the signature's `keyId` → atomically charge the trusted
    source-IP attempt bucket (`429` with its configured `Retry-After` when crossed) → **server
    allowlist gate** (`isFediverseInstanceApprovedByHostname`, `403` if the instance isn't
    `approved`) → reject an already-limited authenticated hostname before buffering the body →
    buffer at most 1 MiB → verify that the body matches its `Digest` header without network access
    (`401` on mismatch) → resolve the signing
    actor (`getOrFetchRemoteActorByKeyId`, fetching and caching the remote actor document on first
    sight) → verify the HTTP Signature (`401` on failure) → atomically charge the sender-hostname
    bucket (`429` with a configured `Retry-After` when the allowance is crossed) → parse the activity body
    (`400` on malformed JSON/missing fields) → **actor-spoof check**: the activity's own `actor`
    field must match the actor that actually signed the request (`401` on mismatch — distinct from
    the keyId/document match already enforced inside `getOrFetchRemoteActorByKeyId`) → **replay
    dedup** (`recordInboxActivity`; a duplicate delivery returns `200` and skips dispatch) →
    `dispatchInboundActivity`, which maps `Follow`/`Undo(Follow)` onto the existing
    `remote_actor -> user` follow entity-relation (tagged `origin: 'remote'`, gating Phase C3's
    loop prevention), maps `Like`/`Undo(Like)` onto the isolated `ap_posts`/`ap_post_likes` ledger
    (`@services/ap-post-likes` — deliberately never `post_votes`, so a remote actor's Like can
    never move local ranking; see the reuse-mapping table in
    [the architecture doc](../../../docs/overview/architecture/fediverse-federation.md)), and
    silently no-ops any other activity type.

  When `activitypub-inbox.async_delivery_enabled` is false, the synchronous path above remains the rollout
  fallback and preserves its existing response statuses. When enabled, the request path stays
  network-free for unknown actors: after the header/body/digest/allowlist/rate-limit preflight it
  writes the exact request bytes and signed header envelope to `ap_inbox_deliveries`, attempts an
  awaited enqueue, and returns `202` once PostgreSQL is durable even if that first enqueue fails.
  If the signing `keyId` already has a local `remote_actors` row, the API verifies the signature
  against that cached key (a self-contained DB read plus crypto) and rejects invalid signatures
  before any durable row exists; a valid cached signer is accepted with `remote_actor_id`,
  `verified_at`, and `sender_allowed_at` already checkpointed. The I/O worker still fetches unknown
  actors, verifies freshness relative to `received_at`, charges senders that were not already
  admitted, and then deduplicates and dispatches. A recovered retry of a checkpointed actor skips
  key fetch and cryptographic verification while still rechecking approval and parsing the body. A
  five-minute PostgreSQL reconciler recovers missing or abandoned jobs. The canonical typed
  lifecycle, fencing rules, and atomic completion boundary live in the
  [inbox activity service contract](../../services/ap-inbox-activities/README.md#durable-delivery-lifecycle).

  ```mermaid
  flowchart LR
    R[POST inbox] --> P[Network-free preflight]
    P --> C{Cached signer?}
    C -->|yes, invalid| X401[401 no row]
    C -->|yes, valid| D[(ap_inbox_deliveries)]
    C -->|unknown| D
    D --> Q[activitypub-inbox queue]
    Q --> V[Fetch unknown actor and verify]
    V --> A[Rate limit and dispatch]
    A --> X[Atomically commit core effect and delete envelope]
    D --> Rec[Five-minute recovery claim]
    Rec --> Q
  ```

## Performance

- **`GET /.well-known/webfinger`**: one username-lookup query (`getPublicUserByIdOrSlug`) plus one
  federation-flag query (`isFederationEnabledForUser`). Sets the standard short public cache
  header.
- **`GET /.well-known/nodeinfo`**: no DB calls — a static discovery document. Sets the standard
  short public cache header.
- **`GET /nodeinfo/2.0`**: one aggregate `COUNT(*)` query (`getTotalUserCount`). Sets the standard
  short public cache header.
- **`GET /ap/users/:userId`**: one user lookup, one federation-flag query, and one actor-keypair
  get-or-create (a single `INSERT ... ON CONFLICT DO UPDATE` — idempotent, generates a keypair
  only on first call for that user). Sets the standard long public cache header.
- **`POST /ap/inbox`, async delivery enabled**: the API charges the source-IP attempt bucket, reads the
  instance allowlist and early sender-limit state, buffers/parses at most 1 MiB, and looks up a
  cached remote actor by `keyId` (no outbound fetch). A cached actor is verified in-process before
  the durable write; an unknown actor is persisted unverified. It then writes one exact envelope
  row and awaits one enqueue attempt. The I/O worker performs any remaining remote-actor
  lookup/fetch, received-time signature and actor verification, sender-limit increment when the
  row is not already admitted, dedup insert, and activity-specific relation/like writes.
  Five-minute recovery adds a bounded PostgreSQL claim plus bulk enqueue only for eligible
  abandoned rows.
- **`POST /ap/inbox`, async delivery disabled**: the inline fallback performs the same preflight, then
  the remote-actor lookup/fetch, signature verification, sender-limit increment, deduplication, and
  dispatch before returning its existing `200`/`202` or rejection status. Neither mode is cached;
  outbound follower delivery remains a separate queue.
