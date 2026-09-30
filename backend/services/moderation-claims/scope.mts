import createError from 'http-errors'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getReportResolutionContext } from '@services/moderation-reports/resolve'

export async function assertItemInCommunity(
  communityId: string,
  options: { reportId?: string | null; postId?: string | null },
): Promise<void> {
  const { reportId, postId } = options
  if (postId) {
    const { rows } = await read(sql`/* assertItemInCommunity:post */
      SELECT 1 FROM community_post_reviews
      WHERE post_id = ${postId}
        AND community_id = ${communityId}
      LIMIT 1
    `)
    if (rows.length === 0) throw createError(404, 'Post not found in this community')
    return
  }
  if (reportId) {
    const context = await getReportResolutionContext(reportId, communityId)
    if (!context) throw createError(404, 'Report not found')
    if (!context.is_in_community_scope) throw createError(403, 'Forbidden')
  }
}
