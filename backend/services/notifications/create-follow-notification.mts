import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { truncateText } from './shared.mts'

export async function createFollowNotification(
  followeeId: string,
  followerId: string,
  followerUsername: string | null | undefined,
  options?: { isReferralSignup?: boolean },
) {
  const isReferralSignup = options?.isReferralSignup ?? false
  const displayUsername = followerUsername ? `@${followerUsername}` : 'Someone'
  const title = isReferralSignup
    ? truncateText(`Your referral ${displayUsername} signed up and followed you!`, 300)
    : truncateText(`${displayUsername} started following you`, 300)
  const targetPath = followerUsername ? `/user/${followerUsername}` : '/'

  const { rows } = await write(sql`/* createFollowNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      actor_user_id,
      delivery_type,
      title,
      body,
      actor_label,
      target_path
    )
    VALUES (
      ${followeeId},
      'follow',
      ${followerId},
      'subscription',
      ${title},
      '',
      ${followerUsername},
      ${targetPath}
    )
    ON CONFLICT DO NOTHING
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
