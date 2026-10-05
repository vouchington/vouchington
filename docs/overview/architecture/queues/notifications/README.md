# Notifications System

Source entrypoint: [backend/queues/notifications/README.md](../../../../../backend/queues/notifications/README.md)

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
- `processDeliverCopyrightNotice` claims one durable in-app copyright intent and writes an
  idempotent, non-sensitive member notification.
- `processReconcileCopyrightDeliveryIntents` runs every five minutes. It concurrently walks every
  UUID-keyset page of the pending or expired-claim in-app intents, email intents, and email intake
  responses, routing each ID to its in-app or transactional-email job with a stable key. The sweep
  only lists rows; a lease-expired row at the retry cap is failed by its own job's claim. A failed
  page read or enqueue does not stop the rest; the job then fails with an `AggregateError` of every
  failure so the queue retries it.
- `processApplyCopyrightAction` claims one revision-fenced copyright media action, rechecks its
  authoritative image placement and active blockers, then applies a reversible withhold or restore.
- `processReconcileCopyrightActionIntents` runs every five minutes. In order, it replays rejected
  form reviews, recreates lost decision assessments, enforces every compliant assessment that still
  owes an unrestricted target, reverses a suspended claimant's unreviewed automatic restrictions
  (whatever the automatic-withholding switch says), materializes due statutory restore intents,
  then re-enqueues pending
  or expired-claim action intents. Each sweep walks every UUID-keyset page, so no backlog is starved
  by a fixed batch. A failed item or stage does not stop the rest; the job then fails with an
  `AggregateError` of every failure so the queue retries it.
- `processCheckCopyrightReviewTarget` runs every five minutes. It reads
  `copyright.reviewTargetMinutes`, counts copyright cases and received emails waiting past that
  target and open counter-notice deadlines past escalation or restoration, and sends one tagged
  Sentry warning with counts and notice or email intake IDs. Paging excludes assessed holds and
  fully held deadlines, keeps unassessed filings actionable, and times automated pending requests
  from receipt; staff queue display is unchanged. It sends nothing when every count is
  zero. See the
  [copyright runbook](../../../../runbooks/copyright-notices.md#review-target-page).
- `processSweepCopyrightEvidenceRetention` runs hourly at minute 17. It calls
  `sweepCopyrightEvidenceRetention`, which first reads `copyright.evidenceRetentionDeletion` and
  `copyright.evidenceRetentionDays` and does nothing while the switch is off (the default) or the
  period is unset. Otherwise it erases the evidence and personal data of at most 25 eligible US
  DMCA cases per run, one case at a time, each in its own transaction: the evidence-bucket objects
  (every version) are deleted before any database column changes, so a bucket refusal leaves the
  case untouched for the next run. Each case first takes the per-account advisory lock that
  placing a preservation hold also takes, for every account party to it, and eligibility (which
  an open hold on any of them fails) is checked again under those locks. Failures are sent to
  Sentry as one tagged warning with counts, notice IDs and error class names, and the job itself
  still completes, because the next run retries every left-over case. A manual trigger is
  throttled for five minutes. See the
  [copyright runbook](../../../../runbooks/copyright-notices.md#evidence-retention-deletion).
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
- `processCommunityActivityDigestScheduleTick` runs Monday at 09:00 UTC. Each tick materializes every missing closed UTC-week window after the durable database cursor and claims incomplete dispatch work whose batch-chain lease has expired. Failed queue admission releases only the current token. Completed rows retain the weekly high-water mark.
- `processCommunityActivityDigestBatch` renews the current lease token, advances a bounded user cursor, bulk-creates combined rows, queues push, schedules the next page, and marks the durable window complete only after its final page. Each `(windowStart, leaseToken, afterUserId)` cursor job is throttled for the recovery interval, bounding repeated admissions within a chain; a successor token cannot be suppressed by an expired chain’s deduplication key. Stale tokens cannot create another batch or complete a successor. Event-key uniqueness keeps notification rows idempotent.

## DSA statement database

`processReconcileDsaStatementSubmissions` runs every five minutes in worker-io. When the independent
switch and start date are set, bounded UUID-keyset pages capture eligible restrictions and enqueue
due submissions. `processSubmitDsaStatementOfReasons` receives only `{ submissionId }`, claims the
work item for 15 minutes, rechecks the date against its restriction, and sends its immutable payload
to the Commission's single-statement endpoint. Both jobs return without enqueueing or HTTP while
the switch is off or the date is unset. Blank credentials leave items pending and write no attempt.

A restriction whose payload build throws an `HttpError` (the only error class the sweep absorbs) is
recorded as a payload-less terminal work item (`failed_at`, `http_<status>` `failure_code`) with one
warning and skipped, so it cannot stall the restrictions after it; the due scan and claim exclude
it, and administrator replay rebuilds its payload. Any other error fails the run.

The work item owns the exact lease and one success UUID. An append-only attempt ledger records
each try and administrator replay. The current round follows the latest `replayed` row; one
permanent failure or five retryable failures derives dead-letter state. An expired claim appends
a `lease_expired` failure before a new claim, so crashes consume the same retry budget. Every
post-HTTP write checks the exact lease token. See the
[operator runbook](../../../../runbooks/copyright-notices.md#dsa-statement-database).

The [durable transition matrix](dsa-statement-transitions.md) records failure, replay, and terminal recovery evidence.

## Enqueue Points

- Durable post-publication reconciliation of post, author, community, RSS, and retained tombstone scopes
- User follow entity listener
- Referral click: [`backend/services/attribution/create.mts`](../../../../../backend/services/attribution/create.mts) (after `session_referral_attributions` INSERT)
- Referral signup: [`backend/services/users/create.mts`](../../../../../backend/services/users/create.mts) (after new user creation with referrerId)

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

| Failure mode                                       | Detectable state                                                                                                    | Recovery/reconciliation path                                                                                                                                                             | Idempotency guarantee                                                       | Evidence (test)                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dispatch failure                                   | Intent remains pending with no current claim after notification commit.                                             | Five-minute `reconcile-push-intents` re-enqueues the durable intent.                                                                                                                     | `(user_id, notification_id)` intent identity.                               | `backend/workers/notifications/processors.mock.test.mts` — recovery backlog                                                                               |
| Provider non-consumption                           | Transport failure, malformed response, 408, 429, or 5xx leaves no terminal receipt.                                 | Worker releases its fence and queue retry or scheduled recovery claims the intent.                                                                                                       | Pending receipt makes the endpoint eligible until a terminal result exists. | `backend/services/notifications-push/push-response-policy.mock.test.mts` — retries transport, transient, and malformed provider failures                  |
| Provider consumption followed by DB-commit failure | A provider success can be followed by a fenced receipt rejection, leaving no receipt after the lease is superseded. | Queue retry or recovery retries the pending endpoint; `predecessor-issue#11009` narrows the batch-persistence duplicate window but cannot remove the provider/DB at-least-once boundary. | No false terminal receipt is written without the fenced database commit.    | `backend/services/notifications-push/push-intent-delivery-branches.mock.test.mts` — does not finalize delivery when its lease is superseded while sending |
| Durable commit followed by reply loss              | A terminal receipt exists although the worker retry result is unknown to its caller.                                | Retry/recovery skips terminal receipts and completes remaining endpoints.                                                                                                                | Receipt primary key plus terminal-only conflict update.                     | `backend/services/notifications-push/push-intent-regressions.mock.test.mts` — terminal receipts                                                           |
| Retry/reconciliation                               | Intent is pending or its lease expired; retryable endpoints have no terminal receipt.                               | Queue retry and five-minute reconciliation reclaim with a new exact lease token.                                                                                                         | Exact-token, unexpired-lease fences all state changes.                      | `backend/services/notifications-push/push-delivery.mock.test.mts` — releases durable lease                                                                |
| TTL expiry                                         | Registration `expiration_time_ms` is due, or an intent lease has expired.                                           | Delivery soft-deletes expired registrations; reconciliation reclaims expired leases.                                                                                                     | Expired registrations are excluded and lease tokens rotate on claim.        | `backend/services/notifications-push/push-delivery.mock.test.mts` — soft-deletes expired subscriptions                                                    |
| Orphan cleanup                                     | Notification or user deletion cascades its intent and endpoint receipts; a subscription may be soft-deleted.        | Foreign keys remove dependent effect records; future delivery reads only active registrations.                                                                                           | FK ownership and `deleted_at` filters.                                      | `backend/services/notifications-push/push-intent-regressions.mock.test.mts` — suppresses deleted notification                                             |
| Normal terminal removal                            | Every endpoint has a delivered or permanently-failed receipt, or none is active.                                    | Worker marks the intent delivered; later notification deletion cascades the terminal record.                                                                                             | Terminal intent state and endpoint receipts prevent re-claim/re-send.       | `backend/services/notifications-push/push-response-policy.mock.test.mts` — terminalizes status                                                            |

Push delivery persists each endpoint result while its exact lease is current. A renewal or
persistence fence rejection destroys the per-intent provider agent, suppresses queued sends, waits
for started work, and leaves the intent pending for recovery. A final release or delivery fence
rejection has the same no-second-mutation outcome.

Required environment variables:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

## Related

Media delivery recovery uses the existing reconciliation job with two payload forms: an empty
root payload, or an exact `scanBefore` plus opaque `after` cursor continuation. Root throttling and
cursor-specific continuation deduplication have separate identities. Continuations keep the root
retry and retention policy, and never use a stable custom job ID. Failed pages replay safely;
terminal registry failures require the existing operator replay. See the
[media-delivery safety protocol](../../services/media-delivery-safety/README.md) and
[worker recovery](../workers/notifications/README.md).

- Service: [../../services/notifications/README.md](../../services/notifications/README.md)
- Emails: [../emails/README.md](../emails/README.md)
- Worker entry: [../../entrypoints/worker-io/README.md](../../backend/entrypoints/worker-io/README.md)
- [docs/requirements/navigation/NOTIFICATIONS.md](../../../../requirements/navigation/NOTIFICATIONS.md)
- [docs/overview/architecture/notifications.md](../../notifications.md)

# Push generation ownership

Push delivery receives a concrete subscription generation, not merely an endpoint. Persistence
rechecks the global owner registry under the intent lease before recording a receipt, retry, or
404/410 cleanup; a stale provider result is ignored.

Copyright reconciliation caps pages per stage through `copyright-notices-work-config`. Continuations carry only unfinished stage cursors and the action sweep evaluation time. They advance the tail even when an individual item fails; retrying the original job and the periodic root sweep retain failed work.
