import {
  hydratedUsername,
  type NotificationText,
  type NotificationTextInput,
} from './notification-text-types'

function post({ notification, hydration }: NotificationTextInput) {
  return notification.post_id ? hydration.posts?.[notification.post_id] : undefined
}

function postTypeKey(
  type: string | undefined,
): 'review' | 'discussion' | 'data_point' | 'link' | 'other' {
  return type === 'review' || type === 'discussion' || type === 'data_point' || type === 'link'
    ? type
    : 'other'
}

const NEW_TITLES = {
  review: {
    anonymous: 'notifications.kind.post_new.review.anonymous',
    byUser: 'notifications.kind.post_new.review.byUser',
  },
  discussion: {
    anonymous: 'notifications.kind.post_new.discussion.anonymous',
    byUser: 'notifications.kind.post_new.discussion.byUser',
  },
  data_point: {
    anonymous: 'notifications.kind.post_new.data_point.anonymous',
    byUser: 'notifications.kind.post_new.data_point.byUser',
  },
  link: {
    anonymous: 'notifications.kind.post_new.link.anonymous',
    byUser: 'notifications.kind.post_new.link.byUser',
  },
  other: {
    anonymous: 'notifications.kind.post_new.other.anonymous',
    byUser: 'notifications.kind.post_new.other.byUser',
  },
} as const

const MANUAL_SEND_TITLES = {
  review: {
    anonymous: 'notifications.kind.post_manual_send.review.anonymous',
    byUser: 'notifications.kind.post_manual_send.review.byUser',
  },
  discussion: {
    anonymous: 'notifications.kind.post_manual_send.discussion.anonymous',
    byUser: 'notifications.kind.post_manual_send.discussion.byUser',
  },
  data_point: {
    anonymous: 'notifications.kind.post_manual_send.data_point.anonymous',
    byUser: 'notifications.kind.post_manual_send.data_point.byUser',
  },
  link: {
    anonymous: 'notifications.kind.post_manual_send.link.anonymous',
    byUser: 'notifications.kind.post_manual_send.link.byUser',
  },
  other: {
    anonymous: 'notifications.kind.post_manual_send.other.anonymous',
    byUser: 'notifications.kind.post_manual_send.other.byUser',
  },
} as const

function newPostTitle(input: NotificationTextInput): string {
  const { t, hydration } = input
  const source = post(input)
  const username = hydratedUsername(hydration, source?.actor_user_id)
  const keys = NEW_TITLES[postTypeKey(source?.post_type)]
  return username === null ? t(keys.anonymous) : t(keys.byUser, { username })
}

function manualSendTitle(input: NotificationTextInput): string {
  const { t, notification, hydration } = input
  const source = post(input)
  const username = hydratedUsername(hydration, notification.sent_by_id)
  const keys = MANUAL_SEND_TITLES[postTypeKey(source?.post_type)]
  return username === null ? t(keys.anonymous) : t(keys.byUser, { username })
}

export function postNew(input: NotificationTextInput): NotificationText {
  return { title: newPostTitle(input), body: post(input)?.snippet ?? '' }
}

export function postReply(input: NotificationTextInput): NotificationText {
  const { t, hydration } = input
  const username = hydratedUsername(hydration, post(input)?.actor_user_id)
  return {
    title: username
      ? t('notifications.kind.post_reply.byUser', { username })
      : t('notifications.kind.post_reply.anonymous'),
    body: post(input)?.snippet ?? '',
  }
}

export function postManualSend(input: NotificationTextInput): NotificationText {
  return { title: manualSendTitle(input), body: post(input)?.snippet ?? '' }
}

export function postRemoved({ t }: NotificationTextInput): NotificationText {
  return { title: t('notifications.kind.post_removed.title'), body: '' }
}

function feedItem({ notification, hydration }: NotificationTextInput) {
  return notification.rss_feed_item_id
    ? hydration.rss_feed_items?.[notification.rss_feed_item_id]
    : undefined
}

export function rssItemNew(input: NotificationTextInput): NotificationText {
  const { t } = input
  const item = feedItem(input)
  return {
    title: t('notifications.kind.rss_item_new.title', {
      feedName: item?.feed_name ?? t('notifications.kind.rss_item_new.fallbackFeed'),
    }),
    body: item?.snippet ?? '',
  }
}

export function rssItemManualSend(input: NotificationTextInput): NotificationText {
  const { t, notification, hydration } = input
  const username = hydratedUsername(hydration, notification.sent_by_id)
  return {
    title: username
      ? t('notifications.kind.rss_item_manual_send.byUser', { username })
      : t('notifications.kind.rss_item_manual_send.anonymous'),
    body: feedItem(input)?.snippet ?? '',
  }
}
