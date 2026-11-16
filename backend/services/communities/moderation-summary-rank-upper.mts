import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'

// Backlog IDs may be ahead of the activity clock. Freeze each raw source's
// persisted maximum instead of clipping pending work to the activity window.
export async function readModerationSummarySourceUpper(
  scan: ModerationSummaryScan,
  source: 'reviews' | 'applications' | 'report-posts',
): Promise<string> {
  if (scan.sourceUpperId !== null) return scan.sourceUpperId
  let rows: { id: string }[]
  if (source === 'reviews') {
    ;({ rows } = await read<{ id: string }>(sql`/* moderationSummaryReviewUpper */
      SELECT post_id AS id FROM community_post_reviews
      WHERE community_id=${scan.communityId}
        AND approved_at IS NULL AND rejected_at IS NULL AND unpublished_at IS NULL
      ORDER BY community_id DESC,post_id DESC LIMIT 1`))
  } else if (source === 'applications') {
    ;({ rows } = await read<{ id: string }>(sql`/* moderationSummaryApplicationUpper */
      SELECT id FROM community_applications WHERE community_id=${scan.communityId}
      ORDER BY community_id DESC,id DESC LIMIT 1`))
  } else {
    ;({ rows } = await read<{ id: string }>(sql`/* moderationSummaryReportPostUpper */
      SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: freezes one community's newest post id across posts' id partitions.
      FROM posts WHERE community_id=${scan.communityId} AND community_id IS NOT NULL
      ORDER BY community_id DESC,id DESC LIMIT 1`))
  }
  return rows[0]?.id ?? MODERATION_SUMMARY_ZERO_ID
}

export async function readModerationSummaryChildUpper(
  scan: ModerationSummaryScan,
): Promise<string> {
  if (scan.childUpperId !== null) return scan.childUpperId
  const { rows } = await read<{ id: string }>(sql`/* moderationSummaryReportUpper */
    SELECT id FROM moderation_reports WHERE post_id=${scan.parentId}
      AND reviewed_at IS NULL AND resolution_action IS NULL
    ORDER BY post_id DESC,id DESC LIMIT 1`)
  return rows[0]?.id ?? MODERATION_SUMMARY_ZERO_ID
}
