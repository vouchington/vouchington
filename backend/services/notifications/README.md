# Notifications Service

Service for storing, listing, mutating, and reconciling per-user notifications in PostgreSQL.

## Data Model

- `notifications`
  - Range-partitioned by the recipient's UUIDv7 `user_id`, initially with one default child
  - One row per user and notified entity
  - Supports `post`, `rss_feed_item`, `follow`, `referral_signup`, and `referral_click` entities
  - `actor_user_id` identifies the user who performed the action (required for `follow` and `referral_signup`)
  - `delivery_type='subscription'` rows are reconciled against live subscriptions
- `delivery_type='manual_send'` rows are snapshot event deliveries created by follower sends
  - `sent_by_user_id` records who triggered a manual send
  - System pruning hides rows via `deleted_at`
  - `delete_reason` distinguishes `system_pruned` from `user_deleted`
  - Preserves read rows via `read_at`
  - Community lifecycle and weekly digest rows use a stable `event_key`; uniqueness includes dismissed rows
  - Reporter review rows persist `target_intent='notifications_inbox'` so clients do not treat them as content links
  - New rows navigate through `target_entity` or `target_intent`; `target_path` is a nullable legacy fallback
- `web_push_subscriptions`
  - Range-partitioned by the owner's UUIDv7 `user_id`, initially with one default child
  - Stores browser push endpoints and keys
  - Soft deletes via `deleted_at`
  - Delivery soft-deletes expired registrations before selecting active endpoints
  - Every explicit enable creates a new `id` activation generation; the unpartitioned
    `web_push_endpoint_owners` registry names the sole exact active endpoint owner

## Notification Creation Rules

### Community notifications

- Application decisions, real role changes, and ownership transfers are inserted in the same transaction as the state change; push is queued only after commit.
- The Monday 09:00 UTC dispatcher processes the previous closed Monday-to-Monday window in bounded recipient batches and creates one combined activity row per recipient/week.
- Communities with no joins, departures, posts, comments, or active posters are omitted. Active vacations suppress a community only when the membership preference is enabled.

### Follow and Referral Notifications

- `follow`: created when user A follows user B (B receives the notification, A is `actor_user_id`)
  - Deduplicated via unique index: one active follow notification per (user_id, actor_user_id) pair
  - If the follower was referred by the followee (`follower.referrer_id === followeeId`), uses referral signup copy
- `referral_signup`: created when a referred user signs up (referrer receives notification, new user is `actor_user_id`)
- `referral_click`: created when someone clicks a referrer's referral link (referrer receives notification)
  - Debounced 5 minutes; all entity columns may be NULL

### Subscribe Notifications

- `user -> subscribe -> post`
  - Notifies for newly created direct child comments/posts only
- `user -> subscribe -> rss_feed`
  - Notifies for newly inserted RSS feed items from that feed
- `user -> subscribe -> user`
  - Notifies for newly created top-level posts by that user
- `user -> subscribe_posts -> topic`
  - Notifies for posts that currently match `relation__post__category__topic`
- `user -> subscribe_rss_feed_items -> topic`
  - Notifies for RSS feed items that currently match `rss_feed_item_categories.topic_id`
  - Also matches manual `relation__rss_feed_item__category__topic`

Notifications apply to entities created while the subscription relation was active:
`created_at` must be at or before the entity notification timestamp, and `deleted_at` must be null
or after that timestamp.

## Manual Send Rules

- `send to followers` creates `delivery_type='manual_send'` rows for the sender's current followers only
- Delivery is a snapshot at send time; followers added later do not receive the notification
- Selected-recipient sends must be a subset of the sender's current followers
- Users cannot send their own posts
- Manual-send rows are not deduplicated against subscription rows or previous sends
- Manual-send rows remain snapshot deliveries for audience changes, but are hidden while their
  referenced post or RSS item is canonically ineligible and restored when that content becomes
  eligible again
- Browser push delivery uses the normal notification push path for manual sends

## Reconciliation Rules

- Flagged posts do not notify users
- Deleted posts do not notify users
- Topic and tag updates are reconciled asynchronously
- The same entity appears at most once per user inbox
- Read subscription notifications are preserved when a recipient no longer matches a subscription;
  content becoming canonically ineligible hides both read and unread content notifications
- Canonical content visibility applies to subscription and manual-send post/RSS rows. Restoration
  only revives `system_pruned` rows and preserves `read_at` and `pushed_at`; a `user_deleted` row
  remains dismissed. Moderator and legal notifications use non-content targets and are excluded.
- Unsubscribing stops future entity notifications only; entities created while subscribed can still
  create or keep notifications even if reconciliation runs after unsubscribe
- Post and RSS item reconcile jobs stream recipients in bounded batches, insert/restore each batch,
  and prune unread non-matches with a temporary recipient table instead of a large in-memory ID list
- Publication reconciliation retains affected RSS item IDs in the existing partitioned dirty-work
  key stream. Source changes and hard deletes retain exact IDs; feed enablement and discoverability
  changes materialize missing IDs in bounded statements outside the writer transaction, with the
  dirty-work row remaining as the durable recovery boundary until reconciliation completes.
- Post reconciliation evaluates canonical publication state once, then applies the current audience
  and community access rules to every candidate recipient across direct and topic subscriptions
- Lag-sensitive post and RSS eligibility snapshots read primary PostgreSQL state so a completed
  publication transition cannot be acknowledged from a stale replica view

Subscription recipient reconciliation scopes insert, restore, and membership-drift pruning to
`delivery_type='subscription'`, so manual sends are neither deduplicated against subscription
reconciliation nor pruned for unsubscribe or topic drift. Canonical content visibility is a separate
transition that scopes only content-generated post/RSS rows and includes both delivery types.

Batch notification writers order their rows by the catalog conflict arbiter before inserting.
Session-private reconciliation tables retain random names, so their writes carry the local
ordering proof required by the [PostgreSQL ordering guard](../../../static-code-analysis/README.md#postgresql-conflict-ordering).

## Public Helpers

- `createFollowNotification(followeeId, followerId, followerUsername, options?)`
- `reconcileNotificationsForPost(postId, options?)`
- `reconcileNotificationsForRssFeedItem(rssFeedItemId, options?)`
- `listNotifications(userId, options?)`
- `getUnreadNotificationsSummary(userId)`
- `markNotificationReadAndGetRedirectTarget(userId, notificationId)`
- `markNotificationRead(userId, notificationId)`
- `markAllNotificationsRead(userId)`
- `deleteNotification(userId, notificationId)`
- `listWebPushSubscriptionsPage(userId, options?)`
- `upsertWebPushSubscription({ userId, ...input })`
- `deleteWebPushSubscription(userId, subscriptionId)`
- `deleteExactWebPushSubscription(userId, { endpoint, subscriptionId })`

Durable browser push delivery lives in
[`@services/notifications-push`](../notifications-push/README.md), which depends on this package
for subscription storage and follows `web-push` as its sole delivery mechanism.

RSS feed item notifications store the external article URL in PostgreSQL, but the web app and push payloads expose only an internal `/notification-redirect?notification_id=...` route. The redirect page looks up the destination server-side so the client never trusts a raw external URL query parameter.

## Related

- Browser push delivery: [../notifications-push/README.md](../notifications-push/README.md)
- System: [../../queues/notifications/README.md](../../queues/notifications/README.md)
- API: [../../api/v1/my/README.md](../../api/v1/my/README.md)
- Web requirements: [../../../docs/requirements/navigation/NOTIFICATIONS.md](../../../docs/requirements/navigation/NOTIFICATIONS.md)
