# Notifications

## Inbox

- Logged-in users have a top-right inbox button in the top bar
- The inbox shows the unread count
- The inbox dropdown previews the newest unread notifications
- The dropdown includes `Mark all as read`
- The dropdown links to `/my/notifications`

## Notification Behavior

- Clicking a notification marks it as read before navigation
- Web, Swift, and .NET resolve structured `target_entity` references before the legacy nullable
  `target_path`. Community targets use the response's minimal `{ id, slug, name }` community
  sidecar; inaccessible/missing targets fall back to `/my/notifications`.
- `target_intent: notifications_inbox` routes directly to `/my/notifications`.
- Native clients must resolve `/notification-redirect?notification_id=...` placeholders through
  `GET /api/v1/my/notifications/:id/redirect-target` before routing; RSS item notifications use
  this server-side bouncer instead of exposing the final article target in `target_path`; resolved
  `http`/`https` targets open in the platform browser instead of native app routing
- Users can delete notifications
- Deletions happen asynchronously
- The same entity should only appear once per delivery type or event in a user's notifications
- Read notifications must not be removed by later reconciliation
- Manual follower sends are separate event deliveries and may coexist with subscription-driven notifications for the same entity
- Reporter review notifications are one-per-report events and use generic copy; they do not expose the reported target, reporter note, moderator identity, or an appeal CTA. They persist `target_intent: notifications_inbox` rather than a content `target_path`.
- Community application decisions, role changes, and ownership transfers are durable event-keyed
  rows; ownership transfer notifies both the previous and new owner.
- A Monday 09:00 UTC job creates at most one combined previous-week community activity digest per
  eligible owner/moderator. Communities without qualifying activity do not contribute. Incomplete
  dispatch windows become eligible for durable requeue after an hour without batch activity and
  restart on the next scheduler tick. Replay starts at the first recipient page, cursor jobs are
  deduplicated by window and page, and the per-recipient event key prevents duplicate digest rows.
- Active vacation suppression is per community and independent from the vacation dates; when
  enabled it suppresses both the weekly in-app digest contribution and moderation-summary email.

## Notification Preferences

- `/my/notification-settings` opens notification preferences directly. Native clients focus or
  select the Notifications section instead of opening generic settings at the top.
- Preferences cover engagement email, news digest frequency, moderation email enablement,
  moderation cadence, moderation days, moderation time, moderation timezone, and community digest
  frequency.
- Moderation schedule fields render only while moderation email is enabled. Day controls render only
  for the selected-days cadence, and the user cannot deselect the final selected day.
- An unset moderation timezone initializes to the device's valid IANA timezone and persists that
  value once. If detection does not produce a valid IANA identifier, the UI falls back to
  `America/Los_Angeles` without persisting it. A saved valid value, including `UTC`, is never
  overwritten.
- Each mutation PATCHes one field. While that field is pending, only its duplicate submissions are
  disabled; other fields remain independently mutable. Success reconciles that field from the
  server response, while failure rolls back only that field to its last saved value. A stale load or
  mutation response must not overwrite a newer field mutation.
- The notification inbox exposes a Settings action that reaches this same preference state without
  duplicating its model.
- Native route activation moves accessibility focus to the notification-settings heading and emits
  the localized route announcement once per activation.

## Subscription Sources

- Subscribing to a post notifies for all new direct child comments/posts
- Subscribing to an RSS feed notifies for all new RSS feed items from that source
- Subscribing to a user notifies for new posts by that user
- Topic subscriptions are split:
  - `subscribe_posts` for topic posts
  - `subscribe_rss_feed_items` for topic RSS feed items
  - Note: the UI to create new topic subscriptions was removed in #6223; the backend relations remain active for existing subscribers
- Users automatically subscribe to their own posts and comments

## Subscription Controls

- Post detail pages expose a subscribe action for replies
- User profile headers expose both `Follow` and `Subscribe to Posts`
- Topic headers expose `Follow`

## Manual Send Controls

- Post cards, post detail pages, and news item cards expose `Send to followers` for eligible non-owner content
- The send modal defaults to `All followers`
- Users can switch to `Selected followers`; the picker searches current followers on the server by username prefix, discards superseded query and cursor responses, and appends de-duplicated cursor pages through its `Load more` control
- A manual send can target 1–100 distinct selected followers
- Sending to people who do not currently follow the sender is disallowed
- Send actions queue chunked notification fanout only for followers who existed at send time

## Reconciliation Rules

- Tags and topic matches can arrive asynchronously, so notifications must be debounced and rechecked
- Flagged posts should not notify users
- Deleted posts should not notify users
- Deleted RSS feed items should not notify users
- Unsubscribing stops future entity notifications only; entities created while subscribed may still
  notify if reconciliation runs after unsubscribe
- Unread notifications may be removed later if the entity becomes invalid because of moderation, deletion, or topic/tag drift

## Push Notifications

- Push notifications are optional and enabled from `/my/notifications`
- Ordinary subscribe actions do not prompt for browser notification permission
- Browser push uses a service worker and the Push API
- Push settings should allow revoking existing browser subscriptions
- Each enable records a fresh server generation even when the browser reuses its physical endpoint;
  the worker accepts push only when endpoint and generation both match its durable binding.
- Disable persists a worker tombstone before idempotent server deactivation. Logout attempts the
  same ordering with a bounded activation wait, so worker startup cannot block session revocation.
- Manual follower sends use the same browser push delivery pipeline as ordinary notifications
- Moderation report review notifications use the same browser push delivery pipeline when push is enabled

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md)
- [Client feature parity contract](../client-feature-parity.json)
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [Routes](./ROUTES.md)
- [Topbar & Search](./TOPBAR-SEARCH.md)
