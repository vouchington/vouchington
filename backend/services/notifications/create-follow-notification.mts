import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createFollowNotification(
  followeeId: string,
  followerId: string,
  followerUsername: string | null | undefined,
  options?: { isReferralSignup?: boolean },
) {
  const isReferralSignup = options?.isReferralSignup ?? false
  const kind = isReferralSignup ? 'follow_referral_signup' : 'follow'
  const targetPath = followerUsername ? `/user/${followerUsername}` : '/'

  const { rows } = await write(sql`/* createFollowNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      actor_user_id,
      kind,
      delivery_type,
      target_path
    )
    VALUES (
      ${followeeId},
      'follow',
      ${followerId},
      ${kind}::notification_kinds,
      'subscription',
      ${targetPath}
    )
    ON CONFLICT DO NOTHING
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
