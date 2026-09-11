# Remote Actors

Caches the minimum state needed to verify inbound HTTP Signatures from, and address outbound
deliveries to, remote ActivityPub actors. Backed by `remote_actors` (migration `0561`) — never
overloaded onto `users`, since remote actors are not local accounts and this table stores no
profile/content data.

- `fetchRemoteActorDocument(actorUri, deps?)` — SSRF-guarded fetch and parse of a remote actor
  JSON document. `deps` (`{ fetchWithTimeout, validateUrl }`) is injectable for tests, mirroring
  `@services/topic-claims/domain-verification-well-known`'s secure transport pattern; production callers omit it and
  get the real `@modules/utils/http` + `ssrf-guard/node` implementations. DNS/SSRF resolution is
  bounded by its own `DNS_TIMEOUT_MS` (5s) — `ssrf-guard/node`'s `validateUrl` has no timeout at
  all unless this is passed — independent of the request/body fetch's `FETCH_TIMEOUT_MS` (10s).
  Validates the document has `id`, `inbox`, and a `publicKey.{id,publicKeyPem}`, and that
  `publicKeyPem` is PEM-well-formed (`@modules/http-signatures`'s `assertPublicKeyPem`).
- `getRemoteActorByKeyId(keyId)` — cache lookup only, no network call.
- `getCheckpointedRemoteActorByIdFromPrimary(id)` — primary-only lookup for the actor paired with
  a durable inbox verification checkpoint. It never fetches and excludes inactive actors, so a
  retry cannot substitute a new identity or miss the just-committed checkpoint through replica lag.
- `getOrFetchRemoteActorByKeyId(keyId, fetchDeps?)` — the primary entry point for the inbox
  receiver (Phase C2). Returns the cached row if one exists and is fresher than
  `REMOTE_ACTOR_CACHE_TTL_MS` (1 hour, mirroring `oauth-google`'s JWKS cache); otherwise derives a
  candidate actor URI by stripping the keyId's fragment (the common `<actorUri>#main-key`
  convention), fetches the document, and **requires the fetched document's own `publicKey.id` to
  equal the requested keyId** before caching it — this rejects a remote server that serves a
  document under a different key than the one presented on the inbound signature, rather than
  silently trusting whatever key that document happens to advertise. A refetch that fails (network
  error or non-2xx response) may fall back to the cached row only while its `fetched_at` is less
  than seven days old. The one-hour freshness TTL and seven-day maximum fallback age are fixed
  security policy, not runtime configuration: rows younger than one hour avoid the network, rows
  from one hour through less than seven days attempt a refresh but tolerate availability failures,
  and rows at least seven days old must refresh successfully. A failed attempt never advances
  `fetched_at`; after the cutoff the typed availability error is rethrown with the transport or
  HTTP-status error retained as its cause. Successful refetches recover the same row in place at
  any age. Bounded DNS-resolution availability failures (including a DNS/SSRF resolution timeout),
  a request-phase fetch timeout, plus an explicitly classified socket interruption or read timeout
  while reading a 2xx body, are availability failures — `fetch-availability-errors.mts` classifies
  all of these via the shared `isTimeoutError` predicate (`@modules/utils/http`). An unsafe
  SSRF-validation decision, an oversized body (still fail-closed — distinct from a body-read
  timeout), content/protocol failure, invalid or identity-mismatched document, and unexpected
  implementation error always fail closed and never use the cached key.
  This is the service-level implementation of the
  [Phase C federation cache policy](../../../docs/overview/architecture/fediverse-federation.md#phase-c--outbound-activitypub-resurrect-the-removed-federation-server--shipped).

Upserts key on `actor_uri` (the partial unique index `idx_remote_actors__actor_uri ... WHERE
deleted_at IS NULL`); a re-fetch of a previously-seen actor refreshes its `key_id`,
`public_key_pem`, `inbox_url`, `shared_inbox_url`, and `fetched_at` in place, since a remote actor
may rotate its key or migrate its inbox URL.

- `listRemoteFollowerInboxPage(userId, afterRemoteActorId, limit)` — read-query keyset page for
  outbound fan-out. It orders active remote followers by `subject_id`, uses the active
  reverse relation index, and returns one row per follower candidate. The ActivityPub distributor
  reads `500 + 1` candidates to form a 500-candidate page, advances across every candidate, and
  deduplicates only the eligible inbox URLs within that page. A follower is eligible at read time
  unless its actor is deleted or its current instance-directory record is explicitly `blocked`;
  absent/unreviewed instance records remain eligible, and a newly blocked follower is excluded
  from later pages. See the [delivery queue contract](../../queues/activitypub-delivery/README.md).

## Performance

Lookups and the get-or-create upsert are both single-row operations. The unique index on
`actor_uri` and this service's own cache-first `getOrFetchRemoteActorByKeyId` keep steady-state
inbox delivery from re-fetching a remote actor document on every request — only first contact (or
a previously-deleted actor) triggers a network call.
