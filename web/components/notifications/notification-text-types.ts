import type { NotificationHydration } from '@/types/api-responses'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { NotificationListNotification } from './notification-list-notification'

export type NotificationT = ReturnType<typeof useTranslations>

/** The sentence a notification row shows; an empty body means the row has only a title. */
export type NotificationText = { title: string; body: string }

export type NotificationTextInput = {
  t: NotificationT
  notification: NotificationListNotification
  hydration: Partial<NotificationHydration>
}

export type NotificationTextRenderer = (input: NotificationTextInput) => NotificationText

/** The username of a hydrated user, or null when the user is gone, hidden or anonymous. */
export function hydratedUsername(
  hydration: Partial<NotificationHydration>,
  userId: string | null | undefined,
): string | null {
  return (userId ? hydration.actors?.[userId]?.username : null) ?? null
}

/** The community's display name, or the catalog fallback when it is gone or not visible. */
export function hydratedCommunityName(
  { t, notification, hydration }: NotificationTextInput,
  communityId: string | null = notification.community_id ?? null,
): string {
  return (
    (communityId ? hydration.communities?.[communityId]?.name : null) ??
    t('notifications.kind.fallbackCommunity')
  )
}

/** Moderator-authored text for the row that owns it; empty when it is unsent or gone. */
export function hydratedPublicText(
  hydration: Partial<NotificationHydration>,
  ownerId: string | null | undefined,
): string {
  return (ownerId ? hydration.public_texts?.[ownerId] : undefined) ?? ''
}
