# Contribution Gating

Gates user contributions based on account age, email verification, membership status, and usage quotas.
Vote endpoints use the same service but opt out of the account-age gate, so fresh verified-email
accounts can vote while post creation and ratings remain age-gated.

Verified email candidates are resolved deterministically from primary then secondary managed
Voucha addresses, followed by verified Apple, Google, LinkedIn, GitHub, Facebook, and Microsoft
provider addresses. X is excluded. Missing verified email returns the dedicated
`EMAIL_VERIFICATION_REQUIRED` precondition code; account age continues to use
`CONTRIBUTION_GATED`.

## Key exports

- `getContributionStatus(currentUser, context)` — returns whether the user is allowed to contribute and why if not
- `assertCanContribute(currentUser, context)` — throws 403 if the user is not allowed to contribute (account too new unless skipped, email unverified)
- `assertWithinContributionActionLimit(currentUser, membershipPlan, action)` — throws 429 if an action-specific cooldown or daily limit is exceeded
- `getContributionActionLimitStatus(currentUser, membershipPlan, action)` — returns the user's current action-specific short-window and daily-window usage
- `resolveContributionPolicy(snapshot, actor, source)` — pure internal lookup for non-exempt actors; trusted admin/system exemptions must be verified before calling it, and it does not read or mutate rate-limit state
- `admitRouteContribution(input)` — PostgreSQL-backed admission reservation for the authored create routes. It atomically owns the global-plus-type quota, canonical intent, replay metadata, and committed mutation.
- `assertWithinContributionQuota(userId, isAdmin, membershipPlan)` — legacy daily quota used by vote endpoints
- `getContributionQuota(userId, isAdmin, membershipPlan)` — legacy quota status for callers without an action

## Admission terminology

- A **reservation** is the durable actor, idempotency key, intent, and replay record created before
  post creation starts. It can represent an in-flight or failed attempt that never produces a post,
  and a committed reservation retains the exact response even if the post is later deleted.
- A **claim** is the short-lived fenced execution lease on one reservation. It prevents concurrent
  attempts from running the protected mutation, can be taken over after expiry, and carries neither
  a durable response nor quota consumption.
- A **finalization** is post-commit recovery work for transaction-captured category state and the
  retained response. It is not a post publication state: Voucha publishes every persisted post
  immediately and does not store draft posts.

## Related

- Contribution limits matrix: [../../../docs/requirements/trust-safety/CONTRIBUTION-LIMITS.md](../../../docs/requirements/trust-safety/CONTRIBUTION-LIMITS.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
- Memberships: [../memberships/README.md](../memberships/README.md)
- Users service: [../users/README.md](../users/README.md)

## Route placement

CAPTCHA-protected create routes must run gates in this order:

1. Require auth, suspension, identity, account-age, email, and membership checks.
2. Parse the request body, then let honeypot requests short-circuit without quota consumption.
3. Validate immutable route and payload shape. Defer mutable referenced-resource and creation
   eligibility checks until after replay resolution.
4. Enter `admitRouteContribution`, which resolves exact replay, intent mismatch, and a matching live
   claim before running disposable challenge work. A new request claims a non-capacity-consuming
   lease.
5. Only the lease owner validates mutable referenced resources, then verifies free Turnstile or App
   Attest challenges.
6. Run a non-consuming PostgreSQL capacity preflight before creation-only mutable eligibility checks
   and any paid reCAPTCHA assessment. The transaction repeats the same capacity check under actor
   serialization because the preflight is only a cost guard, not quota authority. A rejected
   challenge, target check, capacity check, or rolled-back mutation discards or retains the
   admission according to the failure contract.
7. Under actor serialization, atomically commit global and type capacity, the creation mutation,
   and its replay response. The post-mutation actor lock uses `FOR NO KEY UPDATE`, which serializes
   quota commits without conflicting with the foreign-key `KEY SHARE` locks acquired by authored
   rows.
8. Register prepared finalizers on the owning transaction so they run only after commit and are
   discarded on rollback. Durable reconciliation recovers a lost post-commit dispatch. A retry
   with an expired pre-finalization claim remains in progress while category finalization is
   pending, then completes the exact-generation retained response without copying later post state.

Bulk import flows that intentionally consume only daily capacity must use the typed
`resolveContributionDailyOnlyPolicy` admission policy after parsing and validation for each
accepted row/item; that policy cannot carry a short-window limit. Their committed PostgreSQL ledger
entries persist `daily_only` consumption mode, which daily
capacity includes while both aggregate and type short-window capacity exclude.
They must still follow already-existing topics when the standard contribution gate rejects
missing-name recommendations.
Topic imports additionally retain an outer, actor-owned batch response in
[`@services/user-import-export`](../user-import-export/README.md). The outer attempt makes the
ordered mix of existing-topic follows, validation errors, and missing-topic recommendations exactly
replayable; each missing-topic child admission remains the contribution and quota authority for its
one recommendation.

## Authoring limits

New accounts are blocked from authored contributions. Free, Plus, Pro, and Safety limits are
configured independently; Safety is an internal operator ceiling and is never returned by the
public contribution-status endpoint. Each authored post consumes both its internal aggregate
`authored_post` policy and its mapped type policy in the same PostgreSQL transaction.
Articles and blog posts have no user budget: only trusted admin or system actors may create them.
Their trusted identity is verified outside the policy resolver, which cannot construct or accept an
exempt actor.

## Idempotent admission

During the expand/contract window, authored create routes accept an optional UUID `Idempotency-Key`.
Clients keep one key for an unchanged canonical intent and use a new key after success or an intent
change. A matching replay returns the original result. A reused key with a different intent returns
409 `IDEMPOTENCY_KEY_REUSED`; a live reservation returns 409
`CONTRIBUTION_ADMISSION_IN_PROGRESS` with `Retry-After`. Both responses leave the client's unsent
form state intact and expose no quota, Safety, or moderation details. The web client retains at most
100 authenticated actors' pending keys for a rolling 48-hour replay window under SHA-256 intent
fingerprints. The server refreshes the committed replay on every matching retry and adds the same
bounded five-minute clock-skew safety margin. The client preserves opaque actor-scoped pending
entries across account changes and successful logout, and never writes raw form contents to browser
storage. Authenticated browser submissions fail before transport when intent fingerprinting, Web
Locks, or durable storage is unavailable, so separate tabs cannot allocate conflicting keys. The
server-generated fallback for callers without a header is intentionally non-replayable
and exists only during the expand phase; `Idempotency-Key` becomes required after client migration
(#10619). A committed fallback request returns its durable response instead of a retryable
in-progress result, because a retry would mint a new identity and could otherwise duplicate the
mutation.
Durable category recovery may refresh the retained response only for the exact pending create
generation. Replay remains in progress until recovery patches only the create-time topic projection
and marks the retained response complete. Any later category update atomically removes that
permission and completes the original response without rewriting it, so an edit cannot change the
original idempotency result. The initial request also returns in progress while durable category
finalization remains pending. After a claim lease expires, a committed response with no category
finalization marker is completed and replayed directly from its transaction-captured response
without rerunning the challenge or mutation.

A reclaimed noncommitted admission records the retry's current route, scope, source, post type,
and policy revision. An exact committed replay retains its original audit and response data while
refreshing both durable replay boundaries to another 48 hours plus the bounded five-minute
clock-skew margin from the PostgreSQL clock; mismatched or already expired keys never extend the old
record.
