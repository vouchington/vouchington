import type { TransactionQuery } from '@data-stores/psql/types'
import type { Post } from '@services/posts/types'
import sql from 'sql-template-strings'
import type { ImageDeletePostRollback } from './delete-rollback-types.mts'

type LockedPost = {
  id: string
  llm_moderation_content_sha256: Buffer | null
  latest_clearance_change_id: string | null
}

/** Locks all rollback posts before reading their restored moderation content. */
export async function getImageDeletionRollbackSnapshots(
  query: TransactionQuery,
  postRollbacks: ImageDeletePostRollback[],
  affectedPostIds: ReadonlySet<string>,
): Promise<{
  currentPosts: Map<string, LockedPost>
  restoredPosts: Map<string, Post>
}> {
  const ids = new Set<string>()
  for (const rollback of postRollbacks) {
    if (affectedPostIds.has(rollback.post_id)) ids.add(rollback.post_id)
  }
  const currentPosts = new Map<string, LockedPost>()
  const restoredPosts = new Map<string, Post>()
  if (ids.size === 0) return { currentPosts, restoredPosts }

  const { rows: lockedPosts } = await query<LockedPost>(sql`/* rollbackImageDeletion:lockPosts */
    SELECT id, llm_moderation_content_sha256, latest_clearance_change_id
    FROM posts
    WHERE id = ANY(${[...ids].toSorted()}::uuid[])
    ORDER BY id
    FOR UPDATE
  `)
  for (const post of lockedPosts) currentPosts.set(post.id, post)
  if (lockedPosts.length === 0) return { currentPosts, restoredPosts }

  const { rows: snapshots } = await query<Post & { moderation_images: Post['images'] }>(sql`
    /* rollbackImageDeletion:moderationSnapshots */
    SELECT post.*,
      COALESCE(attachments.images, '[]'::json) AS moderation_images
    FROM view_posts post
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'image_id', attachment.image_id,
        'placement_id', placement.id,
        'placement_revision', placement.revision,
        'order_index', attachment.order_index,
        'caption', attachment.caption
      ) ORDER BY attachment.order_index) AS images
      FROM post_images attachment
      JOIN image_placements binding
        ON binding.post_id = attachment.post_id AND binding.image_id = attachment.image_id
      JOIN media_placements placement ON placement.id = binding.placement_id
      WHERE attachment.post_id = post.id AND placement.retired_at IS NULL
    ) attachments ON true
    WHERE post.id = ANY(${lockedPosts.map(post => post.id)}::uuid[])
  `)
  for (const { moderation_images, ...post } of snapshots) {
    restoredPosts.set(post.id, { ...post, images: moderation_images })
  }
  return { currentPosts, restoredPosts }
}
