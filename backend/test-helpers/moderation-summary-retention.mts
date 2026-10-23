import {
  claimModerationEmailSend,
  formatLocalDate,
  getModerationEmailTimezone,
} from '../services/communities/moderation-summary-emails.mts'

export async function claimCurrentModerationSummaryForTest(userId: string): Promise<{
  trackingKey: string
  windowEnd: string
  dispatchTimeZone: string
}> {
  const now = new Date()
  const timeZone = await getModerationEmailTimezone(userId)
  const trackingKey = `daily:${formatLocalDate(now, timeZone)}`
  await claimModerationEmailSend(userId, trackingKey)
  return { trackingKey, windowEnd: now.toISOString(), dispatchTimeZone: timeZone }
}
