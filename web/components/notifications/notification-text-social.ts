import {
  hydratedUsername,
  type NotificationText,
  type NotificationTextInput,
} from './notification-text-types'

export function follow({ t, notification, hydration }: NotificationTextInput): NotificationText {
  const username = hydratedUsername(hydration, notification.actor_user_id)
  return {
    title: username
      ? t('notifications.kind.follow.byUser', { username })
      : t('notifications.kind.follow.anonymous'),
    body: '',
  }
}

export function followReferralSignup({
  t,
  notification,
  hydration,
}: NotificationTextInput): NotificationText {
  const username = hydratedUsername(hydration, notification.actor_user_id)
  return {
    title: username
      ? t('notifications.kind.follow_referral_signup.byUser', { username })
      : t('notifications.kind.follow_referral_signup.anonymous'),
    body: '',
  }
}

export function referralSignup({
  t,
  notification,
  hydration,
}: NotificationTextInput): NotificationText {
  const username = hydratedUsername(hydration, notification.actor_user_id)
  const count = Number(notification.params.referral_count ?? 0)
  return {
    title: username
      ? t('notifications.kind.referral_signup.byUser', { username })
      : t('notifications.kind.referral_signup.anonymous'),
    body:
      count === 1
        ? t('notifications.kind.referral_signup.body.one', { count })
        : t('notifications.kind.referral_signup.body.other', { count }),
  }
}

export function referralClick({ t }: NotificationTextInput): NotificationText {
  return { title: t('notifications.kind.referral_click.title'), body: '' }
}

export function directMessage({ t }: NotificationTextInput): NotificationText {
  return { title: t('notifications.kind.direct_message.title'), body: '' }
}

export function modmail({ t }: NotificationTextInput): NotificationText {
  return { title: t('notifications.kind.modmail.title'), body: '' }
}

export function householdInvitation({ t }: NotificationTextInput): NotificationText {
  return {
    title: t('notifications.kind.household_invitation.title'),
    body: t('notifications.kind.household_invitation.body'),
  }
}
