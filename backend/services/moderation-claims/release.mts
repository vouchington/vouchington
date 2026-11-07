import createError from 'http-errors'
import { runWithTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { recordModeratorActions } from '@services/moderator-actions'
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
    await runWithTransaction(undefined, async (transaction: TransactionQuery) => {
      const { rows } = await transaction<{ community_id: string }>(query)
      await recordModeratorActions(
        currentUserId,
        rows.map(row => ({
          actionType: 'report_unclaim' as const,
          communityId: row.community_id,
          reportId,
        })),
        { query: transaction },
      )
    })
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
