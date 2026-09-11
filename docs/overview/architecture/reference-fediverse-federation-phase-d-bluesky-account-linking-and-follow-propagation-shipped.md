# Fediverse Federation reference

[Back to Fediverse Federation](fediverse-federation.md)

## Phase D — Bluesky account-linking and follow propagation — Shipped

Bluesky is not reachable through the AP actor (see [Protocol reality](reference-fediverse-federation-protocol-reality.md#protocol-reality)) — it needs its own
mechanism. Voucha's server acts as a client here, not a server: per-user OAuth account-linking against
`app.bsky.*` APIs. A new linked-accounts table stores encrypted tokens (`@modules/token-secrets`) keyed
by **DID**, not handle — handles are mutable, DIDs are the stable identifier. This sequences after
Phase C's shared user-follow write-path lands. Account linking and follow/unfollow propagation have
shipped.

Generic Bluesky like propagation is deliberately outside the shipped boundary. The
`app.bsky.feed.like` lexicon requires a strong reference containing the target record's AT URI and
CID. A local Voucha post has neither because the permanent federation boundary forbids publishing
Voucha posts into Bluesky. Linking the voter and author accounts supplies credentials and DIDs, but
does not create the missing target record.

The AT Protocol OAuth client (`backend/modules/bluesky-oauth`) registers as a confidential
`private_key_jwt` client — it signs token requests with a private ES256 (EC P-256) key and serves
the public half inline from `GET /client-metadata.json` — rather than a public `'none'` client, to
get the longer-lived, less-tightly-scoped refresh tokens AT Protocol authorization servers grant
confidential clients. See [backend/modules/bluesky-oauth/README.md](../../../backend/modules/bluesky-oauth/README.md)
for the full design rationale and [environment-variables.md](../infrastructure/environment-variables.md#bluesky-at-protocol)
for the signing-key provisioning.

Native account linking hands the OAuth callback back to the app through a short-lived, one-time
completion. Native begin stores a PKCE-style SHA-256 proof challenge on the durable authorization;
the app retains its verifier. Completion therefore requires the authenticated initiating user, the
one-time bearer token, and the verifier. An intercepted custom-scheme callback cannot attach the
account. Session refresh, finalization, rejection, deletion, and cleanup may mutate only the account
row referencing the exact authorization generation.

Every web and native begin persists a `bluesky_link_authorizations` state-machine row containing the
initiating user, mode, status, expiry, and eventual DID claim. SDK app state contains only its opaque
ID. UUIDs are never compared for causality: explicit status transitions and timestamps govern the
lifecycle. The first callback exclusively claims the DID, and later handoff or replay attempts cannot
replace that claim. All mutation paths use the shared user → DID → authorization/account/completion
lock order; context-free session writes fail closed. Deleted or suspended users are rechecked under
the writer lock, and follow reconciliation/backfill accepts only active users whose authorization is
still `attached`.

### D3 — follow propagation via reconcile, not activity-type discriminant

Once both sides of a `relation__user__follow__user` pair have a linked Bluesky account,
`@services/bluesky-follows` (`backend/services/bluesky-follows`) drives a single
`app.bsky.graph.follow` record to match Voucha's local follow state. It does this by re-deriving
"desired" state from `relation__user__follow__user` on every call and comparing it against a local
receipt row in `bluesky_follow_records`, rather than branching on a Follow/UndoFollow activity type:

| desired follow | receipt exists   | action                                                                          |
| -------------- | ---------------- | ------------------------------------------------------------------------------- |
| yes            | no               | create the `app.bsky.graph.follow` record, save the returned uri as the receipt |
| no             | yes              | delete the Bluesky record using the receipt's uri, then delete the receipt      |
| yes / no       | yes / no (agree) | no-op — already in sync                                                         |

A receipt table is required, not a deterministic record key, because `app.bsky.graph.follow`'s
lexicon declares `key: "tid"` and the reference PDS rejects any non-TID rkey at write time — the
PDS always mints the key, so there is no way to derive an idempotent record address to upsert
against. `bluesky_follow_records` is the substitute idempotency mechanism. This makes
`reconcileBlueskyFollow` safe to call repeatedly for the same pair (on follow, on unfollow, and
from a backfill) — see [backend/services/bluesky-follows/README.md](../../../backend/services/bluesky-follows/README.md)
for the full function-level design, its compensation when receipt persistence fails, and the
queue/worker that calls it.

## Verification

Each phase has its own targeted local commands (typecheck/test scoping, migration linting, manual
curl/Playwright checks, and a Cloudflare-routing check for Phase C) rather than one shared suite — run
the phase's own backend/web test paths plus `pnpm run repo-file-policy` after any Finite Enum Ripple
change, and defer the full suite to CI per the usual workflow.

## Related

- Requirements and current-state boundaries: [FEDIVERSE.md](../../requirements/content/FEDIVERSE.md)
- API route: [backend/api/v1/fediverse/README.md](../../../backend/api/v1/fediverse/README.md)
- Search architecture: [search.md](search.md)
- Staging interoperability runbook: [../../operations/fediverse-staging-interop.md](../../operations/fediverse-staging-interop.md)
- Finite Enum Ripple Checklist: [../../development/finite-enum-ripple-checklist.md](../../development/finite-enum-ripple-checklist.md)
