import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { truncateText } from './shared.mts'

export async function createReferralClickNotification(
  referrerId: string,
  landingUrl: string,
): Promise<Array<{ user_id: string; id: string }>> {
  const body = truncateText(landingUrl, 180)

  const { rows } = await write(sql`/* createReferralClickNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      delivery_type,
      title,
      body,
      target_path
    )
    SELECT
      ${referrerId},
      'referral_click',
      'subscription',
      'Someone clicked your referral link',
      ${body},
      '/my/referrals'
    WHERE NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = ${referrerId}
        AND n.entity_type = 'referral_click'
        AND n.delivery_type = 'subscription'
        AND n.created_at >= now() - interval '5 minutes'
        AND n.deleted_at IS NULL
    )
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
