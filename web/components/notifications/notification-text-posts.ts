import {
  hydratedUsername,
  type NotificationText,
  type NotificationTextInput,
} from './notification-text-types'

function post({ notification, hydration }: NotificationTextInput) {
  return notification.post_id ? hydration.posts?.[notification.post_id] : undefined
}

function newPostTitle(input: NotificationTextInput): string {
  const { t, hydration } = input
  const source = post(input)
  const username = hydratedUsername(hydration, source?.actor_user_id)
  if (username === null) {
    switch (source?.post_type) {
      case 'review':
        return t('notifications.kind.post_new.review.anonymous')
      case 'discussion':
        return t('notifications.kind.post_new.discussion.anonymous')
      case 'data_point':
        return t('notifications.kind.post_new.data_point.anonymous')
      case 'link':
        return t('notifications.kind.post_new.link.anonymous')
      default:
        return t('notifications.kind.post_new.other.anonymous')
    }
  }
  switch (source?.post_type) {
    case 'review':
      return t('notifications.kind.post_new.review.byUser', { username })
    case 'discussion':
      return t('notifications.kind.post_new.discussion.byUser', { username })
    case 'data_point':
      return t('notifications.kind.post_new.data_point.byUser', { username })
    case 'link':
      return t('notifications.kind.post_new.link.byUser', { username })
    default:
      return t('notifications.kind.post_new.other.byUser', { username })
  }
}

function manualSendTitle(input: NotificationTextInput): string {
  const { t, notification, hydration } = input
  const source = post(input)
  const username = hydratedUsername(hydration, notification.sent_by_id)
  if (username === null) {
    switch (source?.post_type) {
      case 'review':
        return t('notifications.kind.post_manual_send.review.anonymous')
      case 'discussion':
        return t('notifications.kind.post_manual_send.discussion.anonymous')
      case 'data_point':
        return t('notifications.kind.post_manual_send.data_point.anonymous')
      case 'link':
        return t('notifications.kind.post_manual_send.link.anonymous')
      default:
        return t('notifications.kind.post_manual_send.other.anonymous')
    }
  }
  switch (source?.post_type) {
    case 'review':
      return t('notifications.kind.post_manual_send.review.byUser', { username })
    case 'discussion':
      return t('notifications.kind.post_manual_send.discussion.byUser', { username })
    case 'data_point':
      return t('notifications.kind.post_manual_send.data_point.byUser', { username })
    case 'link':
      return t('notifications.kind.post_manual_send.link.byUser', { username })
    default:
      return t('notifications.kind.post_manual_send.other.byUser', { username })
  }
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
