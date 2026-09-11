import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type EngagementEmailType = 'follow_topics' | 'post_referral_link' | 'follow_news_sources'

export type EngagementEmailDeliveryStateForTest = {
  claimed_at: Date
  delivery_attempted_at: Date | null
  sent_at: Date | null
}

export async function getEngagementEmailDeliveryStateForTest(
  userId: string,
  emailType: EngagementEmailType,
): Promise<EngagementEmailDeliveryStateForTest> {
  const { rows } = await read<EngagementEmailDeliveryStateForTest>(
    sql`/* getEngagementEmailDeliveryStateForTest */
      SELECT claimed_at, delivery_attempted_at, sent_at
      FROM user_engagement_email_sends
      WHERE user_id = ${userId}
        AND email_type = ${emailType}
    `,
  )
  const state = rows[0]
  if (!state) {
    throw new Error(`No engagement email delivery state for user ${userId} and type ${emailType}`)
  }
  return state
}

export async function ageUnsentEngagementEmailClaimForTest(
  userId: string,
  emailType: EngagementEmailType,
): Promise<void> {
  await write(sql`/* ageUnsentEngagementEmailClaimForTest */
    UPDATE user_engagement_email_sends
    SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '2 days'
    WHERE user_id = ${userId}
      AND email_type = ${emailType}
      AND sent_at IS NULL
  `)
}
