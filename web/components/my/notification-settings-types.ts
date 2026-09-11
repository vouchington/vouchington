import type { EmailPreferences } from '@/lib/api/client/email-preferences'

export type NotificationSettingsState = Omit<EmailPreferences, 'moderation_email_timezone'> & {
  moderation_email_timezone: string
}

export type NotificationSettingsField = keyof NotificationSettingsState

export type UpdateNotificationSetting = <K extends NotificationSettingsField>(
  field: K,
  value: NotificationSettingsState[K],
  optimistic?: boolean,
  allowSavedDuplicate?: boolean,
) => Promise<boolean>
