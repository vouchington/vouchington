# @services/bluesky-accounts

Owns the `bluesky_linked_accounts` table and the account-linking business logic for Phase D
(Bluesky follow propagation via AT Protocol account-linking). `@modules/bluesky-oauth` owns
only the `@atproto/oauth-client-node` SDK boundary; this package owns storage (Postgres + Valkey)
and orchestration.

Interactive begin and web/native callback completion run in the API process. The provider-scoped
egress flag selects the guarded direct transport or HTTP CONNECT proxy for SDK requests.
Callback completion is mode-specific and resumes from the durable `callback_claimed` state, so a
lost reply never replays the provider authorization code. A web timeout or uncertain dispatch runs
the same exact-generation recovery: `callback_claimed` completion resumes durably, while `pending`
keeps the authorization open for a late worker or a retry when the server-side SDK state was not
consumed. Browser callback parameters alone cannot restore already-consumed SDK state.
Native completion creates the plaintext handoff token in the API process and persists only its
hash. After any native completion failure the API locks the exact authorization generation: a
claimed callback persists the API-held token hash and a matching handoff is returned. A still-pending
generation remains retryable only while its durable state proves the provider callback was not
consumed. Provider errors and timeouts
fence a pending native generation because the SDK state may be consumed or a late worker could
create a handoff for a plaintext token the API already discarded. If another concurrent callback
already made the generation
`handoff_ready` with a different hash, the loser fails closed without deleting the winning
completion, provider session, or authorization generation.

## What lives here

- `state-store.mts` — `BlueskyStateStore`, a Valkey-backed `NodeSavedStateStore` for the
  short-lived PKCE/DPoP state generated during the OAuth authorize step. Not encrypted (ephemeral,
  10-minute TTL) — matches the existing convention for Valkey-only OAuth/challenge state elsewhere
  in this codebase (`@services/passkeys`, `@services/mfa`).
- `session-store.mts` — `BlueskySessionStore`, a Postgres-backed `NodeSavedSessionStore` against
  `bluesky_linked_accounts`, encrypted via `@modules/token-secrets` (`encryptSecret`/
  `decryptSecret`, purpose `bluesky:session:<bluesky_did>`). Callback writes receive the initiating
  user and authorization ID through AsyncLocalStorage, take user-then-DID lifecycle locks, and
  persist an exact-generation row. Restore, refresh, and revoke carry the exact attached user and
  authorization through the same context; context-free writes fail closed. UUIDs are identifiers,
  not clocks: durable authorization status and expiry timestamps decide every transition.
- `client.mts` — `getBlueskyOAuthClient()`, a memoized `NodeOAuthClient` wired with the two stores
  above.
- `connect.mts` — `connectBlueskyAccountToUser` (409-if-linked-elsewhere, mirrors
  `@services/oauth-accounts`'s `connectOAuthAccountToUser`) and `getBlueskyLinkedAccountForUser`.
  Attachment locks the user then DID, rechecks active/deleted/suspended state on the writer, and
  requires the exact pending authorization owner and generation.
- `disconnect.mts` — `disconnectBlueskyAccountFromUser`, scoped to the calling user's own DID, then
  delegates to `revokeBlueskySession` (which deletes the row via `SessionStore.del()` — no separate
  application-level delete step). Durable accepted requests use a separate exact-generation path
  that requires `disconnect_requested_at`; its authorization lookup reads the primary so a newly
  accepted request cannot be missed by an immediately running worker.
- `callback-completion.mts` — resumes web/native callback completion for one exact authorization
  generation after the provider callback has durably claimed the session. Callback completion
  authorization reads use the PostgreSQL primary because they immediately follow primary session
  and authorization writes; ordinary state discovery remains replica-safe. Web timeout and
  uncertain-dispatch recovery share `resolveWebBlueskyCallbackUncertainCompletion`. Native failure
  handling remains separately fenced as described above.
- `link.mts` — begins and validates callback state. Both route-mode classification through
  `peekBlueskyAccountLinkAppState` and the direct callback's returned-state validation resolve the
  authorization through `getBlueskyLinkAuthorizationForCallbackFromPrimary`; replica lag must not
  misclassify a newly created or newly claimed callback generation.
- `native-completion.mts` — creates and atomically consumes short-lived native handoffs. Only a
  purpose-bound HMAC of the 256-bit completion token is stored in
  `bluesky_link_completions`. Consumption also requires the app-held PKCE-style proof verifier
  matching the authorization's SHA-256 challenge. Successful consumption attaches the DID and
  deletes the handoff in one PostgreSQL transaction, then invalidates user state after commit.

`view_users_private` (`data-stores/psql/views/2025-01-01-view-users.sql`) exposes the link as
`bluesky_account: { did, handle } | null` on `GET /api/v1/my/identity`, read through the
`users_private` Valkey cache (`getUserPrivateByAnyCached`). Both `connectBlueskyAccountToUser` and
`disconnectBlueskyAccountFromUser` call `void enqueueOnUserUpdated(userId)` after their write so
that cache is busted — mirroring `@services/my/oauth-account`'s `disconnectOAuthAccount`. Without
this, a freshly linked/unlinked account would not show up in the identity response until the
1-hour `users_private` TTL expires.
Rows with `disconnect_requested_at` are hidden immediately from this view and ordinary linked-
account reads while the replayable disconnect worker finishes provider cleanup.

Account deletion shares a per-user PostgreSQL advisory lock with native completion creation and
consumption. Completion creation rechecks active/deleted/suspended state on the writer before it
inserts the handoff. A native flow first claims the unattached provider session through the
authorization's exclusive DID claim; token refresh and finalization must match its exact account
generation and owner. If deletion or suspension won, the rejected flow removes only its exact
unattached account generation and preserves the callback's existing error mapping. Once a valid
handoff winner is durable, callback redelivery preserves it even if the user is later suspended or
deleted; final consumption still rechecks whether the user may attach the account.
Inside the deletion transaction it removes every `bluesky_follow_records` receipt involving the
user, deletes the user's attached session, and deletes only unattached sessions owned by that
user's pending native handoffs before soft-deleting the user. It also removes stale handoffs that
reference an account now attached to somebody else without deleting that other user's session.
Deleting an owned session row cascades to its handoff, so a callback cannot leave a live encrypted
credential behind after deletion commits.
Expired-handoff cleanup discovers candidate users without row locks, acquires their advisory locks
in sorted order, and only then locks completion/provider rows. User deletion takes the same user
lock first, eliminating the former completion-to-provider versus provider-to-completion deadlock.
Explicit unlink remains the path that attempts remote Bluesky follow deletion before revoking the
session; account deletion prioritizes atomic local credential removal and drops its local receipts.

- `link.mts` — `beginBlueskyAccountLink` / `completeBlueskyAccountLink`, the two-step orchestration
  around the OAuth redirect round trip. Begin first persists a `bluesky_link_authorizations` row;
  SDK `appState` carries only its opaque ID (see below).

## Why account-linking here differs from `@services/oauth`'s `connectOAuthAccountFlow`

`connectOAuthAccountFlow` (Google/Apple-style) links an account within a single request/response,
because the browser already holds a provider ID token by the time it calls our API. AT Protocol
OAuth has no client-side equivalent — it's a full server-side redirect dance (PAR → user consents
on their own PDS → authorization-server redirect back to our callback with a code). So linking
here is two separate service functions (`beginBlueskyAccountLink`, `completeBlueskyAccountLink`)
called from two separate routes, not one.

The authorization ID round-trips through the SDK's `appState` as `{ authorizationId }`, passed at
`authorize()`-time and returned verbatim from `callback()`-time (see
`@modules/bluesky-oauth/authorize.mts` and `callback.mts`), because the callback route needs
an opaque lookup key and the OAuth `code` alone does not identify the initiating Voucha user.
User, handle, callback mode, status, challenge, and expiry are loaded from PostgreSQL rather than
trusted from the state payload. `appState` needs no additional signing to resist tampering in transit:
it is never serialized into the redirect URL itself — the SDK stores it server-side in the
`StateStore`, keyed by its own randomly-generated, single-use `state` nonce (confirmed by reading
`@atproto/oauth-client`'s `oauth-client.js`: `authorize()` calls `stateStore.set(state, { ...,
appState })` with an internally-generated `state`, and `callback()` looks it up and deletes it by
the `state` query param before ever touching `appState`).

That is not the same as treating possession of the URL as an _authorization_ decision: the
authorization URL returned by `beginBlueskyAccountLink` is otherwise portable — nothing binds it to
the browser that requested it — so an attacker could start their own link flow and send the
resulting URL to a victim; if the callback trusted the stored initiator alone, the victim's Bluesky DID
would land on the attacker's Voucha account. The callback route calls `requireAuth` (the Voucha
session cookie is `sameSite: 'lax'`, per `set-authentication-cookies.mts`, so it _is_ present on
this top-level cross-site GET redirect in the legitimate flow) and `completeBlueskyAccountLink`
rejects when the authenticated callback user does not own the authorization, closing that hijack.
A session that has expired mid-flow, or was never established, surfaces as a `bluesky_error`
redirect (`not_logged_in`) rather than silently trusting the state payload.
The callback also applies `assertNotSuspended` before entering `completeBlueskyAccountLink`, so a
user suspended while authorization is in flight cannot exchange the callback or persist a link.
The writer repeats that check under the shared user lock immediately before attachment; if it
rejects, the exact pending credential is fenced and deleted.

Native callbacks do not depend on a browser cookie. The route peeks at the server-side SDK state
to identify native mode, completes the provider callback, reloads the initiating user from the
trusted app state, and rejects deleted or suspended users before creating the one-time handoff.
The native client must authenticate normally when consuming that handoff, which re-establishes
ownership at the API boundary. It must also present the verifier retained when begin supplied the
SHA-256 challenge, so an intercepted custom-scheme callback URL or bearer completion token is
insufficient to attach an account. The callback URI is fixed rather than caller-supplied.

## Lifecycle threat model

- Callback replay cannot overwrite another generation: only `pending` may claim a DID, and the
  account, completion, and authorization reference the same exact authorization ID.
- Relink, refresh, revoke, unlink, deletion, and cleanup never compare UUID ordering. They lock in
  user → DID → authorization/account/completion order and validate explicit status and timestamps.
- Web authorization URLs remain cookie-bound to their initiating Voucha user. Native handoffs are
  bearer-token plus proof-verifier bound, and both are consumed at most once.
- Deleted or suspended users are rejected again under the writer lock. Follow reconciliation and
  backfill resolve only active users with an `attached` authorization, so delayed work cannot
  restore remote state for an ineligible account.

## See also

- `@modules/bluesky-oauth` — the SDK boundary this package injects its stores into.
- [docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md) — Phase D section.
