import { read, write } from '@data-stores/psql'

export async function readTestEngagementCandidateTypes(userId: string): Promise<string[]> {
  const { rows } = await read<{ email_type: string }>(
    `/* candidateTypes */ SELECT email_type FROM user_engagement_email_candidates
     WHERE user_id = $1::uuid ORDER BY email_type`,
    [userId],
  )
  return rows.map(row => row.email_type)
}

export async function readTestEngagementClaimedAt(userId: string): Promise<Date> {
  const { rows } = await read<{ claimed_at: Date }>(
    `/* readEngagementAdmissionClaim */ SELECT claimed_at FROM user_engagement_email_sends
     WHERE user_id = $1::uuid AND email_type = 'follow_topics'`,
    [userId],
  )
  if (!rows[0]) throw new Error('Expected claimed engagement email')
  return rows[0].claimed_at
}

export async function setTestEngagementEmailsEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await write(
    `/* setTestEngagementEmailsEnabled */ UPDATE users
     SET is_engagement_emails_enabled = $2::boolean WHERE id = $1::uuid`,
    [userId, enabled],
  )
}

export async function setTestPrimaryEngagementEmail(
  userId: string,
  isPrimary: boolean,
): Promise<void> {
  await write(
    `/* setTestPrimaryEngagementEmail */ UPDATE user_email_addresses
     SET is_primary = $2::boolean
     WHERE user_id = $1::uuid AND ($2::boolean OR is_primary = TRUE)`,
    [userId, isPrimary],
  )
}

export async function suspendTestEngagementUser(userId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* suspendEngagementAdmission */ INSERT INTO user_suspensions (user_id)
     VALUES ($1::uuid) RETURNING id`,
    [userId],
  )
  return rows[0]!.id
}

export async function liftTestEngagementSuspension(suspensionId: string): Promise<void> {
  await write(
    `/* liftEngagementAdmission */ UPDATE user_suspensions SET lifted_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [suspensionId],
  )
}

export async function unfollowTestEngagementTopic(userId: string, topicId: string): Promise<void> {
  await write(
    `/* unfollowEngagementAdmission */ UPDATE relation__user__follow__topic
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE subject_id = $1::uuid AND object_id = $2::uuid AND deleted_at IS NULL`,
    [userId, topicId],
  )
}

export async function ageTestEngagementClaims(userIds: readonly string[]): Promise<void> {
  await write(
    `/* tieEngagementAdmissionClaims */ UPDATE user_engagement_email_sends
     SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '25 hours'
     WHERE user_id = ANY($1::uuid[]) AND email_type = 'post_referral_link'`,
    [userIds],
  )
}

export async function staggerTestEngagementClaimsWithinMillisecond(
  userIds: readonly string[],
): Promise<void> {
  await write(
    `/* microsecondEngagementAdmissionClaims */ UPDATE user_engagement_email_sends sends
     SET claimed_at = date_trunc('milliseconds', CURRENT_TIMESTAMP - INTERVAL '25 hours')
       + (ordered.position * INTERVAL '100 microseconds')
     FROM (SELECT user_id, row_number() OVER (ORDER BY user_id DESC) AS position
           FROM user_engagement_email_sends
           WHERE user_id = ANY($1::uuid[]) AND email_type = 'post_referral_link') ordered
     WHERE sends.user_id = ordered.user_id AND sends.email_type = 'post_referral_link'`,
    [userIds],
  )
}

export async function ageTestEngagementClaim(userId: string): Promise<void> {
  await write(
    `/* expireEngagementOwnedClaim */ UPDATE user_engagement_email_sends
     SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '25 hours'
     WHERE user_id = $1::uuid AND email_type = 'post_referral_link'`,
    [userId],
  )
}
