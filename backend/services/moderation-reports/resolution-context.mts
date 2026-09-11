import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ReportResolutionContext = {
  status: string
  is_in_community_scope: boolean
  derived_community_id: string | null
  target_post_id: string | null
}

export async function getReportResolutionContext(
  reportId: string,
  communityId?: string,
  options?: QueryOptions,
) {
  const { rows } = await read(
    sql`/* getReportResolutionContext */
      SELECT
        CASE
          WHEN r.reviewed_at IS NULL THEN 'pending'
          ELSE r.resolution_action::text
        END AS status,
        CASE
          WHEN ${communityId ?? null}::uuid IS NULL THEN true
          WHEN r.post_id IS NOT NULL THEN
            COALESCE(target_post.community_id, root_post.community_id) = ${communityId ?? null}::uuid
          ELSE false
        END AS is_in_community_scope,
        CASE
          WHEN r.post_id IS NOT NULL THEN
            COALESCE(target_post.community_id, root_post.community_id)
          ELSE NULL
        END AS derived_community_id,
        CASE
          WHEN r.post_id IS NOT NULL THEN target_post.id
          ELSE NULL
        END AS target_post_id
    FROM moderation_reports r
    LEFT JOIN posts target_post
      ON r.post_id IS NOT NULL
      AND target_post.id = r.post_id
    LEFT JOIN posts root_post
      ON r.post_id IS NOT NULL
      AND target_post.post_type = 'comment'
      AND root_post.id = target_post.root_id
    WHERE r.id = ${reportId}
    LIMIT 1
  `,
    options,
  )

  return rows[0] as ReportResolutionContext | undefined
}
