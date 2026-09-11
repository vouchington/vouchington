import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Resolve the user ID that a report is targeting:
 *  - reported_user_id IS NOT NULL → the entity itself
 *  - post_id IS NOT NULL (post or comment) → the post author (created_by_id)
 *  - other types → null (no applicable user target)
 * Returns null if the report does not exist.
 */
export async function getModerationReportTargetUserId(reportId: string): Promise<string | null> {
  const { rows } = await read(sql`/* getModerationReportTargetUserId */
    SELECT
      CASE
        WHEN r.reported_user_id IS NOT NULL THEN r.reported_user_id
        WHEN r.post_id IS NOT NULL THEN p.created_by_id
        ELSE NULL
      END AS target_user_id
    FROM moderation_reports r
    LEFT JOIN posts p ON r.post_id IS NOT NULL AND p.id = r.post_id
    WHERE r.id = ${reportId}
    LIMIT 1
  `)
  const row = rows[0] as { target_user_id: string | null } | undefined
  return row?.target_user_id ?? null
}

/**
 * Returns true when a moderation report's target post/comment belongs to the given community.
 * Only applicable when post_id IS NOT NULL; always returns false for other types.
 */
export async function isModerationReportInCommunityScope(
  reportId: string,
  communityId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* isModerationReportInCommunityScope */
    SELECT
      CASE
        WHEN r.post_id IS NOT NULL THEN
          COALESCE(target_post.community_id, root_post.community_id) = ${communityId}::uuid
        ELSE false
      END AS in_scope
    FROM moderation_reports r
    LEFT JOIN posts target_post
      ON r.post_id IS NOT NULL AND target_post.id = r.post_id
    LEFT JOIN posts root_post
      ON r.post_id IS NOT NULL AND target_post.post_type = 'comment' AND root_post.id = target_post.root_id
    WHERE r.id = ${reportId}
    LIMIT 1
  `)
  const row = rows[0] as { in_scope: boolean } | undefined
  return row?.in_scope ?? false
}
