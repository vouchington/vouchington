import createError from 'http-errors'
import { beginTransaction, write } from '@data-stores/psql'
import { recordModeratorAction } from '@services/moderator-actions'
import sql from 'sql-template-strings'
import { assertItemInCommunity } from './scope.mts'

export async function releaseModerationQueueItem(
  currentUserId: string,
  options: {
    communityId?: string | null
    reportId?: string | null
    postId?: string | null
  },
): Promise<void> {
  const { communityId, reportId, postId } = options
  const hasReport = !!reportId
  const hasPost = !!postId

  if (hasReport === hasPost) {
    throw createError(422, 'Exactly one of reportId or postId must be set')
  }

  if (hasReport) {
    if (communityId) await assertItemInCommunity(communityId, { reportId })
    const query = sql`/* releaseModerationQueueItem */
      UPDATE moderation_queue_claims
      SET released_at = now()
      WHERE report_id = ${reportId}
    `
    if (communityId) query.append(sql` AND community_id = ${communityId}::uuid`)
    query.append(sql` AND claimed_by_id = ${currentUserId}
        AND released_at IS NULL
    `)
    query.append(sql` RETURNING community_id`)
    await using transaction = await beginTransaction()
    const { rows } = await transaction<{ community_id: string }>(query)
    await Promise.all(
      rows.map(row =>
        recordModeratorAction(
          currentUserId,
          { actionType: 'report_unclaim', communityId: row.community_id, reportId },
          { query: transaction },
        ),
      ),
    )
    await transaction.commit()
    return
  }

  if (communityId) await assertItemInCommunity(communityId, { postId })
  const query = sql`/* releaseModerationQueueItem */
    UPDATE moderation_queue_claims
    SET released_at = now()
    WHERE post_id = ${postId}
  `
  if (communityId) query.append(sql` AND community_id = ${communityId}::uuid`)
  query.append(sql` AND claimed_by_id = ${currentUserId}
      AND released_at IS NULL
  `)
  await write(query)
}
