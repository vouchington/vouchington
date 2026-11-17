import {
  hydratedPublicText,
  type NotificationText,
  type NotificationTextInput,
} from './notification-text-types'

export function reportReviewed({ t }: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.report_reviewed.title'),
    body: t('notifications.kind.report_reviewed.body'),
  }
}

export function criticalModerationAlert({ t }: NotificationTextInput): NotificationText {
  return { title: t('notifications.kind.critical_moderation_alert.title'), body: '' }
}

export function reviewDisputeResolved({
  t,
  notification,
  hydration,
}: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.review_dispute_resolved.title'),
    body: hydratedPublicText(hydration, notification.review_dispute_id),
  }
}

export function reviewActionedRemoved({ t }: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.review_actioned_removed.title'),
    body: t('notifications.kind.review_actioned_removed.body'),
  }
}

export function reviewActionedNote({ t }: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.review_actioned_note.title'),
    body: t('notifications.kind.review_actioned_note.body'),
  }
}

export function userWarning({
  t,
  notification,
  hydration,
}: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.user_warning.title'),
    body:
      hydratedPublicText(hydration, notification.user_warning_id) ||
      t('notifications.kind.user_warning.body'),
  }
}

export function moderationAppealResolved({
  t,
  notification,
  hydration,
}: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.moderation_appeal_resolved.title'),
    body: hydratedPublicText(hydration, notification.moderation_appeal_id),
  }
}

export function communityBan({ t }: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.community_ban.title'),
    body: t('notifications.kind.community_ban.body'),
  }
}
