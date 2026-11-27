import sql, { type SQLStatement } from 'sql-template-strings'
import type { ModerationReportStatus } from './config.mts'
import { appendModerationReportStatusPredicate } from './sort-sql.mts'

export type PostReportEnrichmentOptions = {
  status: ModerationReportStatus
  countMode: 'distinct_reporters' | 'rows'
}

/**
 * Lateral joins that attach `report_counts.report_count` and `latest_judgement.recommended_action`
 * to a post/comment report row alias `r` (where `r.post_id` is always a `posts.id`).
 *
 * `posts`, `users`, `url_hostnames`, and `rss_feed_item_guids` each generate independent UUIDv7
 * primary keys, so matching only `post_id = r.post_id` keeps both probes on post-scoped partial
 * indexes without cross-target OR arms.
 */
export function postReportEnrichmentJoinsSql({
  status,
  countMode,
}: PostReportEnrichmentOptions): SQLStatement {
  const countExpression =
    countMode === 'distinct_reporters' ? 'COUNT(DISTINCT rc.reporter_user_id)' : 'COUNT(*)'
  const fragment = sql`
    LEFT JOIN LATERAL (
      SELECT `
  fragment.append(countExpression)
  fragment.append(sql`::integer AS report_count
      FROM moderation_reports rc
      WHERE rc.post_id = r.post_id
        AND `)
  appendModerationReportStatusPredicate(fragment, 'rc', status)
  fragment.append(sql`
    ) report_counts ON true
    LEFT JOIN LATERAL (
      SELECT mj.recommended_action
      FROM moderation_report_judgements mj
      WHERE mj.post_id = r.post_id
      ORDER BY mj.id DESC
      LIMIT 1
    ) latest_judgement ON true
  `)
  return fragment
}
