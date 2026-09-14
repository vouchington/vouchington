import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ImageDeletePostRollback } from './delete-rollback-types.mts'

export type ImageDeletePostRollbackSnapshot = Omit<
  ImageDeletePostRollback,
  'revision_id' | 'deleted_content_sha256' | 'deleted_clearance_change_id' | 'clearance_reset'
>

export async function getImageDeletePostRollbackSnapshots(
  query: TransactionQuery,
  postIds: string[],
): Promise<ImageDeletePostRollbackSnapshot[]> {
  const { rows } =
    await query<ImageDeletePostRollbackSnapshot>(sql`/* getImageDeletePostRollbackSnapshots */
    SELECT post.id AS post_id,
      post.approved_at,
      post.rejected_at,
      post.in_review_at,
      post.latest_clearance_change_id AS clearance_change_id,
      clearance_change.changed_by_id AS clearance_changed_by_id,
      clearance_change.public_reason_code AS clearance_public_reason_code,
      clearance_change.private_note AS clearance_private_note,
      COALESCE(clearance_change.platform_override, false) AS clearance_platform_override,
      post.llm_moderation_content_sha256
    FROM posts post
    LEFT JOIN post_clearance_changes clearance_change
      ON clearance_change.id = post.latest_clearance_change_id
    WHERE post.id = ANY(${postIds}::uuid[])
    ORDER BY post.id
    FOR UPDATE OF post
  `)
  return rows
}
