# attribution

Tracks which user referred a session, linking anonymous visitors to a referrer for signup attribution.

## Flow

1. Visitor lands on `/@username` or any URL with `?referrer=username`
2. Next.js proxy ([`web/proxy.ts`](../../../web/proxy.ts)) fires `POST /api/v1/attribution/referrer` (fire-and-forget via `after()`)
3. Service resolves the referrer to a `user_id` and upserts a `session_referral_attributions` row (see [Retention & dedup](#retention--dedup)); fires a `referral_click` notification to the referrer (5-min debounced at the queue layer, and only on a genuinely new (session, referrer) pair)
4. On signup, [`backend/services/users/create.mts`](../users/create.mts) calls `getReferrerIdForSession(sessionId)` to associate the new user with the referrer via `users.referrer_id`, updates `signed_up_at` on the attribution row, and fires a `referral_signup` notification

## Table: `session_referral_attributions`

| Column                               | Type        | Notes                                                                                                                         |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `session_id`                         | UUID        | Anonymous session (no FK — sessions live outside PostgreSQL)                                                                  |
| `referrer_id`                        | UUID?       | FK to users, `ON DELETE SET NULL` — attribution row is preserved but column is set to NULL if referrer deletes account        |
| `user_id`                            | UUID?       | FK to users, `ON DELETE SET NULL` — set on signup; attribution row is preserved but column is set to NULL on account deletion |
| `landing_url`                        | TEXT        | Max 2048 chars                                                                                                                |
| `signed_up_at`                       | TIMESTAMPTZ | Set when the session's visitor signs up; NULL for clicks that never converted                                                 |
| `utm_source/medium/campaign/content` | TEXT?       | Normalized lowercase, max 255 chars                                                                                           |

`RANGE (id)`-partitioned with a default partition only (see [partitioning strategy](../../../docs/overview/architecture/partitioning-strategy.md)); no partition-drop retention, and none is planned — see below.

## Retention & dedup

Resolves [#8750](https://github.com/jonathanong/filaments/issues/8750): whether user-linked
attributions should ever age out.

- **Anonymous rows age out after 30 days.** Row-based cleanup deletes `user_id IS NULL` rows past
  their retention window via [`backend/services/data-retention/cleanup.mts`](../data-retention/cleanup.mts).
- **User-linked rows are retained for the life of the account.** They are not exempt forever:
  `deleteUser` nulls `user_id`, which drops the row into the same 30-day anonymous sweep. This is
  the final decision — a partition-drop retention model was considered and rejected for this table
  because a `DROP` is unconditional and can't honor the `user_id IS NULL` predicate.
- **Repeat clicks dedup by moving to latest, not by inserting another row.** `createSessionReferralAttribution`
  deletes any prior unconverted row for the same `(session_id, referrer_id)` pair and reinserts with
  a fresh `id`, so the row's recency (and its 30-day cutoff) tracks the _last_ click. A referral
  click notification only fires for a genuinely new pair, not on every repeat click. A
  transaction-scoped advisory lock on that pair serializes concurrent replacements before their
  candidate owners are read, so an anonymous repeat cannot discard a concurrently supplied
  signed-in owner. A prior owner who has already passed the privacy fence is skipped: the repeat
  click still replaces the row, but it does not lock or carry that deleted `user_id`.
- **A converted row (`signed_up_at` set) is frozen**, not moved: minting a new `id` would make
  `created_at` (`uuid_extract_timestamp(id)`) postdate `signed_up_at`, i.e. the click would appear
  to happen after the signup it caused. This means `created_at` means "last click" for unconverted
  rows but stays "first click" for converted ones — this shows up in the click log and the
  [GDPR export](../account-data-requests/stream-consents.mts).

**Known limitation:** `getReferrerIdForSession` picks the first-touch referrer via
`ORDER BY id ASC LIMIT 1`. Moving a repeat click to a fresh `id` can reorder which row is smallest.
Concretely: a session clicks referrer A, then B, then C, then re-clicks A before signing up — A's
row gets a new, larger `id`, so this query now returns B instead of A as first touch. This only
misattributes when a session revisits an earlier referrer among several before converting; fixing
it precisely would need a dedicated "first click" column, which is a schema change out of scope for
this dedup pass.

## API

```ts
// Create attribution record for a session (fires referral click notification)
createSessionReferralAttribution({ sessionId, referrer, landingUrl, userId?, utm? })

// Get referrer user ID for a session (used at signup)
getReferrerIdForSession(sessionId)

// Mark attribution rows as converted when a referred visitor signs up
updateAttributionSignup(sessionId, referrerId, userId)

// Paginated list of click log entries for a referrer
getReferralClickLog(referrerId, options?: { after?, limit? })
```

## Authorization

```ts
// Returns true if currentUser is the referrer or an administrator
currentUserCanViewReferralClickLog(currentUser, referrerId)
```

## Consumers

- **Signup flow** ([`backend/services/users/create.mts`](../users/create.mts)) — sets `users.referrer_id`, calls `updateAttributionSignup`, enqueues referral signup notification
- **Attribution API** ([`backend/api/v1/attribution/`](../../api/v1/attribution/)) — records clicks, enqueues referral click notification
- **Click log API** ([`backend/api/v1/my/referral-clicks.mts`](../../api/v1/my/referral-clicks.mts)) — returns paginated click history to the referrer
- **Prioritized referral links** ([`backend/services/prioritized-referral-links/`](../prioritized-referral-links/)) — tier 3: "users who referred the current user"
- **Data retention** ([`backend/services/data-retention/cleanup.mts`](../data-retention/cleanup.mts)) — deletes old anonymous attributions

## UTM

UTM parameters are extracted and normalized by the `@ts-shared/utm` facade (`resolveUtmSource`,
`extractUtmParams`), which configures the package-backed parser with Voucha shortcode aliases and
the `ref` fallback.

## Related

- [Attribution API](../../api/v1/attribution/README.md)
- [Users Service](../users/README.md)
- [Prioritized Referral Links Service](../prioritized-referral-links/README.md)
