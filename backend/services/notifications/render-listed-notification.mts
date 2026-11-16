import { notificationTranslator } from './notification-translator.mts'
import { renderNotificationText, type NotificationText } from './render-notification-text.mts'
import type { Notification, NotificationHydration } from './types.mts'

/** Renders one notification of a listed page in the reader's UI locale, the way push does. */
export function renderListedNotification(
  page: { notifications: Record<string, Notification> } & NotificationHydration,
  id: string,
  uiLocale: string | null = 'en',
): NotificationText {
  const notification = page.notifications[id]
  if (!notification) throw new Error(`Notification ${id} is not in the page`)
  return renderNotificationText(notificationTranslator(uiLocale), notification, page)
}
