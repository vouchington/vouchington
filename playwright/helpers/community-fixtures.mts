import { allowUnannotatedQuery } from '@vouchington/postgres'
import { write } from '../../backend/data-stores/psql/clients.mts'

export async function setTestCommunityMarkdown(
  communityId: string,
  markdown: string,
): Promise<void> {
  await write(allowUnannotatedQuery('UPDATE communities SET markdown = $1 WHERE id = $2'), [
    markdown,
    communityId,
  ])
}

export async function pinTestCommunityPost(input: {
  communityId: string
  postId: string
  pinnedById: string
  orderIndex?: number
}): Promise<void> {
  await write(
    `/* playwright pinTestCommunityPost */
     INSERT INTO community_pinned_posts (community_id, post_id, order_index, pinned_by_id)
     VALUES ($1, $2, $3, $4)`,
    [input.communityId, input.postId, input.orderIndex ?? 0, input.pinnedById],
  )
}
