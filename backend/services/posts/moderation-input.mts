import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPostByAny } from './get.mts'
import type { Post } from './types.mts'

/** Builds moderation content from authoritative attachments, independent of edge publication lag. */
export async function getPostModerationInput(
  postId: string,
  options: Pick<QueryOptions, 'query' | 'readOnly'> = {},
): Promise<Post | null> {
  const query = options.query ?? read
  const post = (await getPostByAny(postId, options)) as Post | null
  if (!post) return null
  const { rows: images } = await query<{
    image_id: string
    placement_id: string
    placement_revision: number
    order_index: number
    caption: string
  }>(sql`/* getPostModerationInput:images */
    SELECT attachment.image_id, placement.id AS placement_id,
      placement.revision AS placement_revision, attachment.order_index, attachment.caption
    FROM post_images attachment
    JOIN image_placements binding
      ON binding.post_id = attachment.post_id AND binding.image_id = attachment.image_id
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE attachment.post_id = ${postId} AND placement.retired_at IS NULL
    ORDER BY attachment.order_index
  `)
  return { ...post, images }
}
