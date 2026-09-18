# Notifications System

Glide Queue system for reconciling notifications and delivering browser push messages.

## Queue

- Queue name: `notifications`

## Jobs

- `reconcile-post`
  - Recomputes recipients for a single post notification target
  - Inserts missing notifications and prunes unread invalid ones
- `reconcile-rss-feed-item`
  - Recomputes recipients for a single RSS feed item
- `deliver-push-intent` claims a durable intent, rechecks live notification/content eligibility, and records endpoint completion.
- `reconcile-push-intents` runs every five minutes to re-enqueue pending or expired-lease intents.
- `delete-notification`
  - Performs asynchronous soft deletion for user-initiated deletes
- `follow-notification`
  - Creates a follow notification for the followee when a user follows them
  - Checks referral context: if the follower was referred by the followee, uses referral signup copy
  - Deduplicates via unique index on (user_id, actor_user_id) for active follow notifications
- `referral-signup-notification`
  - Creates a `referral_signup` notification for the referrer when a referred user signs up
  - Fetches the new user's username to personalize title ("@username signed up through your referral!")
  - Body includes total referral count via SQL subquery
  - Deduplicates per (referrerId, newUserId) pair within the standard dedup window
- `referral-click-notification`
  - Creates a `referral_click` notification for the referrer when someone clicks their referral link
  - Debounced 5 minutes, keyed on referrerId only — rapid clicks from different URLs collapse into one notification
  - Body shows the truncated landing URL
- `processCommunityActivityDigestScheduleTick` runs Monday at 09:00 UTC. Each tick materializes every missing closed UTC-week window after the durable database cursor and requeues incomplete dispatches with no batch activity for an hour.
- `processCommunityActivityDigestBatch` refreshes the window activity timestamp, advances a bounded user cursor, bulk-creates combined rows, queues push, schedules the next page, and marks the durable window complete only after its final page. Each `(windowStart, afterUserId)` cursor job is throttled for the recovery interval, bounding overlapping restarts; event-key uniqueness keeps notification rows idempotent.

## Enqueue Points

- Durable post-publication reconciliation of post, author, community, RSS, and retained tombstone scopes
- User follow entity listener
- Referral click: [`backend/services/attribution/create.mts`](../../services/attribution/create.mts) (after `session_referral_attributions` INSERT)
- Referral signup: [`backend/services/users/create.mts`](../../services/users/create.mts) (after new user creation with referrerId)

## Debounce Expectations

- Topic/tag classification is asynchronous, so reconcile jobs may run multiple times
- Moderation and deletion updates can invalidate unread notifications later
- Unsubscribe actions do not enqueue pruning for historical notifications
- Reconcile processors receive created notification IDs per bounded service batch and enqueue
  `deliver-push-intent` jobs per batch, instead of holding the whole fanout in memory

## Push Delivery

`deliver-push-intent` soft-deletes expired registrations, reads active rows from
`web_push_subscriptions`, and sends Web Push payloads with `web-push`.

The notification trigger creates `notification_push_intents` in the same transaction as every write.
Producers enqueue the durable intent after commit; the recovery schedule makes a missed enqueue replayable.
Follower-distribution and community-digest retries can return notification rows created before the
trigger existed, so those replay queries also ensure the missing durable intents before enqueueing.
Full recovery pages immediately keyset through one fixed database snapshot. Retryable failures move
beyond that snapshot, so the periodic five-minute schedule starts a bounded retry pass without an
outage-time queue loop.

### Durable transition matrix

| Failure mode                                       | Detectable state                                                                                                    | Recovery/reconciliation path                                                                                                                                                                                                   | Idempotency guarantee                                                       | Evidence (test)                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dispatch failure                                   | Intent remains pending with no current claim after notification commit.                                             | Five-minute `reconcile-push-intents` re-enqueues the durable intent.                                                                                                                                                           | `(user_id, notification_id)` intent identity.                               | `backend/workers/notifications/processors.mock.test.mts` — recovery backlog                                                                               |
| Provider non-consumption                           | Transport failure, malformed response, 408, 429, or 5xx leaves no terminal receipt.                                 | Worker releases its fence and queue retry or scheduled recovery claims the intent.                                                                                                                                             | Pending receipt makes the endpoint eligible until a terminal result exists. | `backend/services/notifications-push/push-response-policy.mock.test.mts` — retries transport, transient, and malformed provider failures                  |
| Provider consumption followed by DB-commit failure | A provider success can be followed by a fenced receipt rejection, leaving no receipt after the lease is superseded. | Queue retry or recovery retries the pending endpoint; `predecessor-issue#11009` narrows the batch-persistence duplicate window but cannot remove the provider/DB at-least-once boundary. | No false terminal receipt is written without the fenced database commit.    | `backend/services/notifications-push/push-intent-delivery-branches.mock.test.mts` — does not finalize delivery when its lease is superseded while sending |
| Durable commit followed by reply loss              | A terminal receipt exists although the worker retry result is unknown to its caller.                                | Retry/recovery skips terminal receipts and completes remaining endpoints.                                                                                                                                                      | Receipt primary key plus terminal-only conflict update.                     | `backend/services/notifications-push/push-intent-regressions.mock.test.mts` — terminal receipts                                                           |
| Retry/reconciliation                               | Intent is pending or its lease expired; retryable endpoints have no terminal receipt.                               | Queue retry and five-minute reconciliation reclaim with a new exact lease token.                                                                                                                                               | Exact-token, unexpired-lease fences all state changes.                      | `backend/services/notifications-push/push-delivery.mock.test.mts` — releases durable lease                                                                |
| TTL expiry                                         | Registration `expiration_time_ms` is due, or an intent lease has expired.                                           | Delivery soft-deletes expired registrations; reconciliation reclaims expired leases.                                                                                                                                           | Expired registrations are excluded and lease tokens rotate on claim.        | `backend/services/notifications-push/push-delivery.mock.test.mts` — soft-deletes expired subscriptions                                                    |
| Orphan cleanup                                     | Notification or user deletion cascades its intent and endpoint receipts; a subscription may be soft-deleted.        | Foreign keys remove dependent effect records; future delivery reads only active registrations.                                                                                                                                 | FK ownership and `deleted_at` filters.                                      | `backend/services/notifications-push/push-intent-regressions.mock.test.mts` — suppresses deleted notification                                             |
| Normal terminal removal                            | Every endpoint has a delivered or permanently-failed receipt, or none is active.                                    | Worker marks the intent delivered; later notification deletion cascades the terminal record.                                                                                                                                   | Terminal intent state and endpoint receipts prevent re-claim/re-send.       | `backend/services/notifications-push/push-response-policy.mock.test.mts` — terminalizes status                                                            |

Push delivery persists each endpoint result while its exact lease is current. A renewal or
persistence fence rejection destroys the per-intent provider agent, suppresses queued sends, waits
for started work, and leaves the intent pending for recovery. A final release or delivery fence
rejection has the same no-second-mutation outcome.

Required environment variables:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

## Related

- Service: [../../services/notifications/README.md](../../services/notifications/README.md)
- Emails: [../emails/README.md](../emails/README.md)
- Worker entry: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
- [docs/requirements/navigation/NOTIFICATIONS.md](../../../docs/requirements/navigation/NOTIFICATIONS.md)
- [docs/overview/architecture/notifications.md](../../../docs/overview/architecture/notifications.md)

# Push generation ownership

Push delivery receives a concrete subscription generation, not merely an endpoint. Persistence
rechecks the global owner registry under the intent lease before recording a receipt, retry, or
404/410 cleanup; a stale provider result is ignored.
