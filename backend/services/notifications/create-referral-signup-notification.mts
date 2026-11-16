import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createReferralSignupNotification(
  referrerId: string,
  newUserId: string,
  newUserUsername: string | null | undefined,
): Promise<Array<{ user_id: string; id: string }>> {
  const targetPath = newUserUsername ? `/user/${newUserUsername}` : '/'

  const { rows } = await write(sql`/* createReferralSignupNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      delivery_type,
      actor_user_id,
      kind,
      params,
      target_path
    )
    SELECT
      ${referrerId},
      'referral_signup',
      'subscription',
      ${newUserId},
      'referral_signup',
      (
        SELECT jsonb_build_object('referral_count', COUNT(*))
        FROM users
        WHERE referrer_user_id = ${referrerId}
          AND deleted_at IS NULL
      ),
      ${targetPath}
    WHERE NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = ${referrerId}
        AND n.actor_user_id = ${newUserId}
        AND n.entity_type = 'referral_signup'
        AND n.deleted_at IS NULL
    )
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
