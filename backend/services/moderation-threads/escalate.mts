import createError from 'http-errors'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { openModInternalThread } from './create.mts'
import { getReportResolutionContext } from '@services/moderation-reports/resolve'

export async function escalateModerationQueueItem(
  currentUserId: string,
  options: {
    communityId: string
    reportId?: string | null
    postId?: string | null
  },
): Promise<void> {
  const { communityId, reportId, postId } = options

  if (reportId) {
    const context = await getReportResolutionContext(reportId, communityId)
    if (!context) throw createError(404, 'Report not found')
    if (!context.is_in_community_scope) throw createError(403, 'Forbidden')
  }

  await using query = await beginTransaction()
  if (reportId) {
    const { rowCount } = await query(sql`/* escalateModerationQueueItem */
        UPDATE moderation_reports
        SET escalated_at = now(), escalated_by_id = ${currentUserId}
        WHERE id = ${reportId}
          AND reviewed_at IS NULL
          AND escalated_at IS NULL
      `)
    if (!rowCount) {
      // Distinguish already-escalated (retry: proceed to thread creation) from truly gone
      const { rows } = await query<{ escalated_at: Date | null }>(
        sql`/* escalateModerationQueueItem:checkEscalated */
          SELECT escalated_at FROM moderation_reports
          WHERE id = ${reportId} AND reviewed_at IS NULL LIMIT 1
        `,
      )
      if (!rows[0]?.escalated_at) throw createError(404, 'Report not found or already resolved')
      // Already escalated on a prior attempt — fall through to openModInternalThread
    }
  } else if (postId) {
    const { rowCount } = await query(sql`/* escalateModerationQueueItem */
        UPDATE community_post_reviews
        SET escalated_at = now(), escalated_by_id = ${currentUserId}
        WHERE post_id = ${postId}
          AND community_id = ${communityId}
          AND approved_at IS NULL
          AND rejected_at IS NULL
          AND escalated_at IS NULL
      `)
    if (!rowCount) {
      const { rows } = await query<{ escalated_at: Date | null }>(
        sql`/* escalateModerationQueueItem:checkEscalated */
          SELECT escalated_at FROM community_post_reviews
          WHERE post_id = ${postId} AND community_id = ${communityId} LIMIT 1
        `,
      )
      if (!rows[0]?.escalated_at)
        throw createError(404, 'Post review not found or already resolved')
    }
  } else {
    throw createError(422, 'Exactly one of reportId or postId must be set')
  }
  await query.commit()

  await openModInternalThread(currentUserId, { communityId, reportId, postId })
}

export async function deEscalateModerationQueueItem(
  _currentUserId: string,
  options: {
    communityId?: string | null
    reportId?: string | null
    postId?: string | null
  },
): Promise<void> {
  const { communityId, reportId, postId } = options

  if (reportId) {
    if (communityId) {
      const context = await getReportResolutionContext(reportId, communityId)
      if (!context) throw createError(404, 'Report not found')
      if (!context.is_in_community_scope) throw createError(403, 'Forbidden')
    }
    await write(sql`/* deEscalateModerationQueueItem */
      UPDATE moderation_reports
      SET escalated_at = NULL, escalated_by_id = NULL
      WHERE id = ${reportId}
        AND reviewed_at IS NULL
    `)
    return
  }

  if (postId) {
    const { rowCount } = await write(sql`/* deEscalateModerationQueueItem */
      UPDATE community_post_reviews
      SET escalated_at = NULL, escalated_by_id = NULL
      WHERE post_id = ${postId}
        AND (${communityId ?? null}::uuid IS NULL OR community_id = ${communityId ?? null}::uuid)
        AND approved_at IS NULL
        AND rejected_at IS NULL
    `)
    if (!rowCount) throw createError(404, 'Post review not found or already resolved')
    return
  }

  throw createError(422, 'Exactly one of reportId or postId must be set')
}
