import { simpleBody } from './render-notification-body.mts'
import { digestBody } from './render-notification-digest.mts'
import type { Notification, NotificationHydration } from './types.mts'

/** Looks up one catalog string; `notifications.kind.*` keys exist for every notification kind. */
export type NotificationTranslate = (
  key: string,
  parameters?: Record<string, string | number>,
) => string

export type NotificationText = { title: string; body: string }

export type Source = Pick<
  Notification,
  | 'kind'
  | 'params'
  | 'post_id'
  | 'top_post_id'
  | 'rss_feed_item_id'
  | 'actor_user_id'
  | 'sent_by_id'
  | 'community_id'
  | 'community_application_id'
  | 'review_dispute_id'
  | 'moderation_appeal_id'
  | 'user_warning_id'
  | 'copyright_notice_id'
  | 'copyright_notice_delivery_work_item_id'
>

const PREFIX = 'notifications.kind.'
const POST_TYPES = new Set(['review', 'discussion', 'data_point', 'link'])
const SIMPLE_TITLES = new Set([
  'post_removed',
  'referral_click',
  'report_reviewed',
  'critical_moderation_alert',
  'review_dispute_resolved',
  'review_actioned_removed',
  'review_actioned_note',
  'user_warning',
  'moderation_appeal_resolved',
  'community_ban',
  'direct_message',
  'modmail',
  'household_invitation',
  'copyright_claimant_receipt',
  'copyright_status_update',
  'copyright_poster_restriction_notice',
  'copyright_poster_review_notice',
  'copyright_poster_restoration_notice',
  'copyright_owner_information_notice',
  'copyright_claimant_decision_notice',
  'copyright_redress_decision_notice',
])

/** Renders a notification's localized title and body from its kind, params and hydrated facts. */
export function renderNotificationText(
  t: NotificationTranslate,
  notification: Source,
  hydration: NotificationHydration,
): NotificationText {
  const { kind } = notification
  const username = (id: string | null | undefined) =>
    (id ? hydration.actors[id]?.username : undefined) ?? null
  const post = notification.post_id ? hydration.posts[notification.post_id] : undefined
  const feedItem = notification.rss_feed_item_id
    ? hydration.rss_feed_items[notification.rss_feed_item_id]
    : undefined
  const community =
    (notification.community_id ? hydration.communities[notification.community_id]?.name : null) ??
    t(`${PREFIX}fallbackCommunity`)
  const owned = (id: string | null) => (id ? (hydration.public_texts[id] ?? '') : '')
  const withUser = (base: string, name: string | null) =>
    name ? t(`${base}.byUser`, { username: name }) : t(`${base}.anonymous`)
  const postType = POST_TYPES.has(post?.post_type ?? '') ? post!.post_type : 'other'
  const tk = (suffix: string, parameters?: Record<string, string | number>) =>
    t(`${PREFIX}${suffix}`, parameters)

  switch (kind) {
    case 'post_new':
      return {
        title: withUser(`${PREFIX}post_new.${postType}`, username(post?.actor_user_id)),
        body: post?.snippet ?? '',
      }
    case 'post_manual_send':
      return {
        title: withUser(`${PREFIX}post_manual_send.${postType}`, username(notification.sent_by_id)),
        body: post?.snippet ?? '',
      }
    case 'post_reply':
      return {
        title: withUser(`${PREFIX}post_reply`, username(post?.actor_user_id)),
        body: post?.snippet ?? '',
      }
    case 'rss_item_new':
      return {
        title: tk('rss_item_new.title', {
          feedName: feedItem?.feed_name ?? tk('rss_item_new.fallbackFeed'),
        }),
        body: feedItem?.snippet ?? '',
      }
    case 'rss_item_manual_send':
      return {
        title: withUser(`${PREFIX}rss_item_manual_send`, username(notification.sent_by_id)),
        body: feedItem?.snippet ?? '',
      }
    case 'follow':
    case 'follow_referral_signup':
      return { title: withUser(`${PREFIX}${kind}`, username(notification.actor_user_id)), body: '' }
    case 'referral_signup': {
      const count = Number(notification.params.referral_count ?? 0)
      return {
        title: withUser(`${PREFIX}referral_signup`, username(notification.actor_user_id)),
        body: tk(`referral_signup.body.${count === 1 ? 'one' : 'other'}`, { count }),
      }
    }
    case 'community_application_approved':
      return {
        title: tk(`${kind}.title`, { community }),
        body: tk(`${kind}.body`, { community }),
      }
    case 'community_application_rejected': {
      const reason = owned(notification.community_application_id)
      return {
        title: tk(`${kind}.title`, { community }),
        body: reason ? tk(`${kind}.bodyWithReason`, { reason }) : tk(`${kind}.body`, { community }),
      }
    }
    case 'community_role_changed':
      return {
        title: tk(`${kind}.title`, { community }),
        body: tk(`${kind}.body`, {
          from: tk(`role.${roleOf(notification.params.from_role)}`),
          to: tk(`role.${roleOf(notification.params.to_role)}`),
        }),
      }
    case 'community_ownership_received':
    case 'community_ownership_transferred_away':
      return { title: tk(`${kind}.title`, { community }), body: tk(`${kind}.body`, { community }) }
    case 'community_activity_digest':
      return { title: tk(`${kind}.title`), body: digestBody(t, notification, hydration) }
    default:
      return {
        title: SIMPLE_TITLES.has(kind) ? tk(`${kind}.title`) : '',
        body: simpleBody(t, notification, hydration, owned),
      }
  }
}

function roleOf(role: unknown): 'owner' | 'moderator' | 'member' {
  return role === 'owner' || role === 'moderator' ? role : 'member'
}
