import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'

export type ModerationRecipientRow = {
  id: string
  email_address: string
  username: string | null
  ui_locale: string | null
  moderation_email_cadence: 'daily' | 'selected_days' | 'weekly'
  moderation_email_days_of_week: number[]
  moderation_email_time_of_day: string
  moderation_email_timezone: string
}

/**
 * Coverage window for the activity digest fields, derived from the recipient's send cadence:
 * `daily` covers the last 24 hours; `weekly` and `selected_days` both cover the last 7 days
 * (day-of-week selection controls which days a send can happen, not the coverage period).
 */
export function getModerationActivityWindowStart(
  cadence: ModerationRecipientRow['moderation_email_cadence'],
  now: Date,
): Date {
  const hours = cadence === 'daily' ? 24 : 24 * 7
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

export function hasModerationSummaryWork(
  community: CommunityModerationSummaryEmailProps['communities'][number],
): boolean {
  return (
    community.pendingPostReviews > 0 ||
    community.pendingApplications > 0 ||
    community.pendingReports > 0 ||
    community.escalatedItems > 0 ||
    community.suspectedBanEvaders > 0
  )
}

export function isModerationEmailDue(recipient: ModerationRecipientRow, now: Date): boolean {
  if (
    timeToMinutes(formatLocalTime(now, recipient.moderation_email_timezone)) <
    timeToMinutes(recipient.moderation_email_time_of_day)
  ) {
    return false
  }

  const isoDayOfWeek = getIsoDayOfWeekForLocalDate(
    formatLocalDate(now, recipient.moderation_email_timezone),
  )
  if (recipient.moderation_email_cadence === 'daily') return true
  if (recipient.moderation_email_cadence === 'weekly') {
    return isoDayOfWeek === Math.min(...recipient.moderation_email_days_of_week)
  }

  return recipient.moderation_email_days_of_week.includes(isoDayOfWeek)
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function buildModerationSendKey(recipient: ModerationRecipientRow, now: Date): string {
  const localDate = formatLocalDate(now, recipient.moderation_email_timezone)
  if (recipient.moderation_email_cadence === 'weekly') {
    return `weekly:${getIsoWeekKey(localDate)}`
  }
  return `daily:${localDate}`
}

export function formatLocalDate(now: Date, timeZone: string): string {
  return getLocalDateFormatter(timeZone).format(now)
}

function formatLocalTime(now: Date, timeZone: string): string {
  return getLocalTimeFormatter(timeZone).format(now)
}

const localDateFormatters = new Map<string, Intl.DateTimeFormat>()
const localTimeFormatters = new Map<string, Intl.DateTimeFormat>()

function getLocalDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = localDateFormatters.get(timeZone)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  localDateFormatters.set(timeZone, formatter)
  return formatter
}

function getLocalTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = localTimeFormatters.get(timeZone)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  localTimeFormatters.set(timeZone, formatter)
  return formatter
}

function getIsoDayOfWeekForLocalDate(localDate: string): number {
  const date = new Date(`${localDate}T00:00:00.000Z`)
  const day = date.getUTCDay()
  return day === 0 ? 7 : day
}

export function getIsoWeekKey(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00.000Z`)
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNumber = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}
