import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationReport } from './config.mts'

export async function getReporterForCommunityReport(
  reportId: string,
  communityId: string,
): Promise<string | null> {
  const { rows } = await read(sql`/* getReporterForCommunityReport */
    SELECT r.reporter_user_id
    FROM moderation_reports r
    JOIN posts target_post ON r.post_id IS NOT NULL AND target_post.id = r.post_id
    WHERE r.id = ${reportId}
      AND target_post.community_id = ${communityId}
    LIMIT 1
  `)
  return (rows[0]?.reporter_user_id as string | undefined) ?? null
}

export async function getModerationReportById(id: string): Promise<ModerationReport | null> {
  const { rows } = await read(sql`/* getModerationReportById */
    SELECT
      r.id,
      r.created_at,
      r.reviewed_at,
      r.reporter_user_id,
      r.reason,
      r.note,
      CASE
        WHEN r.reviewed_at IS NULL THEN 'pending'
        ELSE r.resolution_action::text
      END AS status,
      r.resolved_by_id,
      CASE
        WHEN r.post_id IS NOT NULL AND p.post_type = 'comment' THEN 'comment'
        WHEN r.post_id IS NOT NULL THEN 'post'
        WHEN r.reported_user_id IS NOT NULL THEN 'user'
        WHEN r.hostname_id IS NOT NULL THEN 'url_hostname'
        WHEN r.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
      END::moderation_report_entity_type AS entity_type,
      COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id) AS entity_id
    FROM moderation_reports r
    LEFT JOIN posts p ON r.post_id IS NOT NULL AND p.id = r.post_id
    WHERE r.id = ${id}
    LIMIT 1
  `)
  return (rows[0] as ModerationReport | undefined) ?? null
}
