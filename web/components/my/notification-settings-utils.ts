import type { EmailPreferences } from '@/lib/api/client/email-preferences'
import type {
  NotificationSettingsField,
  NotificationSettingsState,
} from './notification-settings-types'

const DEFAULT_MODERATION_EMAIL_TIMEZONE = 'America/Los_Angeles'
const TIME_ZONES = getTimeZones()

export function toNotificationSettings(preferences: EmailPreferences): NotificationSettingsState {
  return {
    ...preferences,
    moderation_email_timezone:
      preferences.moderation_email_timezone ?? DEFAULT_MODERATION_EMAIL_TIMEZONE,
  }
}

export function getTimeZoneOptions(selectedTimeZone: string): string[] {
  if (!hasSavedTimeZone(selectedTimeZone)) return TIME_ZONES
  return [...new Set([...TIME_ZONES, selectedTimeZone])].toSorted()
}

export function isSupportedTimeZone(timeZone: string | undefined): timeZone is string {
  if (timeZone === undefined) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

export function hasSavedTimeZone(timeZone: string | null): boolean {
  return typeof timeZone === 'string' && timeZone.length > 0
}

export function settingsValueEquals(
  previousValue: NotificationSettingsState[NotificationSettingsField],
  value: NotificationSettingsState[NotificationSettingsField],
): boolean {
  return (
    (Array.isArray(previousValue) &&
      Array.isArray(value) &&
      previousValue.length === value.length &&
      previousValue.every((item, index) => item === value[index])) ||
    Object.is(previousValue, value)
  )
}

function getTimeZones(): string[] {
  const supported = Intl.supportedValuesOf?.('timeZone') ?? []
  return [...new Set([...supported, DEFAULT_MODERATION_EMAIL_TIMEZONE, 'UTC'])].toSorted()
}
