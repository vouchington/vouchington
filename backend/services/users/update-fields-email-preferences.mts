import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { UpdateUserOptions } from './types.mts'
import { appendSet } from './update-fields-visibility.mts'

export function appendEmailFrequency(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  field: 'news_digest_frequency' | 'community_digest_frequency',
  value: UpdateUserOptions['news_digest_frequency'],
): boolean {
  if (value === undefined) return hasSet
  assert(
    value === 'none' || value === 'daily' || value === 'weekly',
    422,
    `${field} must be none, daily, or weekly`,
  )
  const set =
    field === 'news_digest_frequency'
      ? sql`news_digest_frequency = ${value}`
      : sql`community_digest_frequency = ${value}`
  return appendSet(query, hasSet, set)
}

export function appendBooleanPreference(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  field:
    | 'is_engagement_emails_enabled'
    | 'is_moderation_emails_enabled'
    | 'is_fediverse_federation_enabled',
  value: boolean | undefined,
): boolean {
  if (value === undefined) return hasSet
  assert(typeof value === 'boolean', 422, `${field} must be a boolean`)
  const set =
    field === 'is_engagement_emails_enabled'
      ? sql`is_engagement_emails_enabled = ${value}`
      : field === 'is_moderation_emails_enabled'
        ? sql`is_moderation_emails_enabled = ${value}`
        : sql`is_fediverse_federation_enabled = ${value}`
  return appendSet(query, hasSet, set)
}

export function appendModerationEmailCadence(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  cadence: UpdateUserOptions['moderation_email_cadence'],
): boolean {
  if (cadence === undefined) return hasSet
  assert(
    cadence === 'daily' || cadence === 'selected_days' || cadence === 'weekly',
    422,
    'Invalid moderation_email_cadence value',
  )
  return appendSet(query, hasSet, sql`moderation_email_cadence = ${cadence}`)
}

export function appendModerationEmailDays(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  days: UpdateUserOptions['moderation_email_days_of_week'],
): boolean {
  if (days === undefined) return hasSet
  assert(Array.isArray(days), 422, 'moderation_email_days_of_week must be an array')
  assert(days.length > 0, 422, 'moderation_email_days_of_week cannot be empty')
  assert(
    days.every(day => Number.isInteger(day) && day >= 1 && day <= 7),
    422,
    'moderation_email_days_of_week values must be integers between 1 and 7',
  )
  const normalizedDays = [...new Set(days)].toSorted((a, b) => a - b)
  return appendSet(
    query,
    hasSet,
    sql`moderation_email_days_of_week = ${normalizedDays}::SMALLINT[]`,
  )
}

export function appendModerationEmailTime(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  timeOfDay: UpdateUserOptions['moderation_email_time_of_day'],
): boolean {
  if (timeOfDay === undefined) return hasSet
  assert(
    typeof timeOfDay === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay),
    422,
    'moderation_email_time_of_day must be HH:MM',
  )
  return appendSet(query, hasSet, sql`moderation_email_time_of_day = ${timeOfDay}`)
}

export function appendModerationEmailTimezone(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  timezone: UpdateUserOptions['moderation_email_timezone'],
): boolean {
  if (timezone === undefined) return hasSet
  assert(
    typeof timezone === 'string' &&
      timezone.length > 0 &&
      timezone.length <= 64 &&
      isValidTimeZone(timezone),
    422,
    'moderation_email_timezone must be a valid timezone string',
  )
  return appendSet(query, hasSet, sql`moderation_email_timezone = ${timezone}`)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    getTimeZoneFormatter(timeZone).format()
    return true
  } catch {
    return false
  }
}

const timeZoneFormatters = new Map<string, Intl.DateTimeFormat>()

export function getTimeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = timeZoneFormatters.get(timeZone)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone })
  timeZoneFormatters.set(timeZone, formatter)
  return formatter
}
