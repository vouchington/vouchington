import { formatLocalDate, getIsoWeekKey } from './moderation-summary-emails.mts'

export const MODERATION_EMAIL_SEND_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// Current dispatcher always supplies windowEnd and a daily/weekly key for that local period.
// Once the claim can be pruned, a delayed queue delivery must not send it again.
export function isModerationSummaryJobCurrent(
  trackingKey: string,
  windowEnd: string,
  timeZone: string,
  now: Date,
): boolean {
  const end = new Date(windowEnd)
  if (!Number.isFinite(end.getTime())) return false
  if (end.getTime() > now.getTime()) return false
  if (end.getTime() <= now.getTime() - MODERATION_EMAIL_SEND_RETENTION_DAYS * DAY_MS) return false
  const localDate = formatLocalDate(end, timeZone)
  const expectedKey = trackingKey.startsWith('weekly:')
    ? `weekly:${getIsoWeekKey(localDate)}`
    : `daily:${localDate}`
  return trackingKey === expectedKey
}
