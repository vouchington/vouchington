# ActivityPub Delivery

Builds and signs outbound ActivityPub activities (Phase C4), and owns the durable fan-out cursor.
Activity construction and HTTP delivery are pure/stateless apart from their network boundary;
checkpoint functions use PostgreSQL. `@workers/activitypub-delivery` owns federation checks, key
access, and queue orchestration.

- `buildActivityJson(input)` — builds the AS2 JSON body for `Follow`, `Like`, `Undo(Follow)`, or
  `Undo(Like)`. Pure function, no I/O. Callers supply the durable activity identity:
  new and resurrected user-follow activation IDs live on the relation row, while post Like
  generation IDs are carried by append-only vote events. Legacy Follow/Like generations whose
  original wire ID predates durable identity storage do not emit an ActivityPub Undo. Undo inputs
  require the exact original activity ID, and the embedded Follow/Like object includes that original
  `id` alongside its type and target URI. Queue compatibility handling for pre-upgrade jobs lives in
  the [delivery queue contract](../../queues/activitypub-delivery/README.md).
- `deliverActivityToInbox(input, deps?)` — SSRF-guarded, HTTP-Signature-signed `POST` of an
  activity JSON body to a remote inbox URL. `deps` (`{ validateUrl, fetch }`) is injectable for
  tests; production callers omit it and get `ssrf-guard/node` + `undici.fetch`. Throws
  retry-classified errors for 429/5xx (via `@modules/utils/http`'s `handleHttpErrors`) and a
  generic `http-errors` for other non-2xx statuses (e.g. `410 Gone`, which the worker's
  `wrapHttpForRetry` treats as unrecoverable — correct for a permanently-gone remote actor/inbox).
- `prepareActivityDistributionPage(activityId, sourceUserId)` — transactionally creates or reads
  the per-activity checkpoint and returns at most one 500-candidate follower page after its strict
  remote-actor cursor. Ineligible candidates advance the cursor without producing an inbox, so a
  blocked or deleted run cannot stall progress. It returns completed work without reading
  followers after the final cursor commits.
- `commitActivityDistributionPage(...)` — compare-and-swap advances that cursor only after the
  worker has had Valkey accept the page. A failed or stale commit intentionally leaves replay
  possible; this service does not claim a per-inbox delivery receipt.

Callers are responsible for decrypting the sending user's actor private key immediately before
calling `deliverActivityToInbox` and letting the plaintext PEM go out of scope immediately after —
see `@modules/http-signatures`'s README for the full key-handling contract this module inherits.

## Performance

Both functions are single-request, no batching applicable. `deliverActivityToInbox` bounds two
independent phases: DNS/SSRF resolution (`DNS_TIMEOUT_MS`, 5s — `ssrf-guard/node`'s `validateUrl`
has no timeout at all unless this is passed) and the signed `POST` itself (`DELIVERY_TIMEOUT_MS`,
10s). A DNS-resolution timeout surfaces as a status-less error so the worker's `wrapHttpForRetry`
keeps the delivery retryable, same as a non-2xx delivery response. It always issues exactly one
outbound HTTP request per call — batching across many followers happens one queue job (and
therefore one function call) per inbox, in `@workers/activitypub-delivery`, never in a loop inside
this package.

The checkpoint is retained after completion until its source user is deleted. It prevents a later
duplicate distribution job from restarting a completed fan-out, but it does not recover events
lost in a Valkey wipe or make remote inbox delivery exactly once. See the [worker transition
matrix](../../workers/activitypub-delivery/README.md#durable-fan-out-transition-matrix).
