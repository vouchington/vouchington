import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestModerationQueueClaim(options: {
  communityId: string
  reportId?: string
  postId?: string
  claimedById: string
}): Promise<void> {
  const { communityId, reportId, postId, claimedById } = options
  if (!reportId && !postId) throw new Error('exactly one of reportId or postId must be set')
  await write(sql`/* insertTestModerationQueueClaim */
    INSERT INTO moderation_queue_claims (community_id, report_id, post_id, claimed_by_id)
    VALUES (
      ${communityId}::uuid,
      ${reportId ?? null}::uuid,
      ${postId ?? null}::uuid,
      ${claimedById}::uuid
    )
    ON CONFLICT DO NOTHING
  `)
}

/**
 * Backdates a moderation_queue_claims row so expiry tests can simulate an old claim
 * without sleeping. Accepts either reportId or postId (exactly one must be set).
 */
export async function backdateModQueueClaim(options: {
  reportId?: string
  postId?: string
  userId: string
  /** How many minutes in the past to set claimed_at */
  minutes: number
}): Promise<void> {
  const { reportId, postId, userId, minutes } = options

  if (reportId) {
    await write(sql`/* backdateModQueueClaim */
      UPDATE moderation_queue_claims
      SET claimed_at = now() - (${minutes} || ' minutes')::interval
      WHERE report_id = ${reportId}
        AND claimed_by_id = ${userId}
        AND released_at IS NULL
    `)
    return
  }

  if (postId) {
    await write(sql`/* backdateModQueueClaim */
      UPDATE moderation_queue_claims
      SET claimed_at = now() - (${minutes} || ' minutes')::interval
      WHERE post_id = ${postId}
        AND claimed_by_id = ${userId}
        AND released_at IS NULL
    `)
    return
  }

  throw new Error('backdateModQueueClaim: exactly one of reportId or postId must be set')
}
