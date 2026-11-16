import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The row carries no landing URL: those carry UTM fields that retention scrubs from attributions. */
export async function createReferralClickNotification(
  referrerId: string,
): Promise<Array<{ user_id: string; id: string }>> {
  const { rows } = await write(sql`/* createReferralClickNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      kind,
      delivery_type,
      target_path
    )
    SELECT
      ${referrerId},
      'referral_click',
      'referral_click',
      'subscription',
      '/my/referrals'
    WHERE NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = ${referrerId}
        AND n.entity_type = 'referral_click'
        AND n.delivery_type = 'subscription'
        -- no-mistakes-disable-next-line postgres-generated-column-predicates: No SQL UUIDv7 timestamp-to-bound helper exists; preserve the database-clock five-minute deduplication cutoff.
        AND n.created_at >= now() - interval '5 minutes'
        AND n.deleted_at IS NULL
    )
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
