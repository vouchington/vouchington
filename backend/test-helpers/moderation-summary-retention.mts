import { read } from '../data-stores/psql/index.mts'
import sql from 'sql-template-strings'
import {
  claimModerationEmailSend,
  formatLocalDate,
} from '../services/communities/moderation-summary-emails.mts'

async function getTestModerationEmailTimezone(userId: string): Promise<string> {
  const { rows } = await read<{ moderation_email_timezone: string }>(
    sql`/* getTestModerationEmailTimezone */
      SELECT COALESCE(moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone
      FROM view_users_private
      WHERE id = ${userId}
      LIMIT 1`,
  )
  return rows[0]?.moderation_email_timezone ?? 'America/Los_Angeles'
}

export async function claimCurrentModerationSummaryForTest(userId: string): Promise<{
  trackingKey: string
  windowEnd: string
  dispatchTimeZone: string
}> {
  const now = new Date()
  const timeZone = await getTestModerationEmailTimezone(userId)
  const trackingKey = `daily:${formatLocalDate(now, timeZone)}`
  await claimModerationEmailSend(userId, trackingKey)
  return { trackingKey, windowEnd: now.toISOString(), dispatchTimeZone: timeZone }
}
