import { read } from '@data-stores/psql'
import { isFirstCommunityPost } from '@services/communities/ban-evasion'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runEmbeddingReconciliationScenarios(): Promise<void> {
  const { rows: posts } = await read<{ id: string; community_id: string; created_by_id: string }>(
    `/* explainFirstCommunityPostBoundary */
     WITH seeded_author_community AS (
       SELECT community_id, created_by_id FROM posts WHERE id = $1
     )
     SELECT posts.id, posts.community_id, posts.created_by_id
     FROM posts
     JOIN seeded_author_community seeded
       ON posts.community_id = seeded.community_id
       AND posts.created_by_id = seeded.created_by_id
     WHERE posts.deleted_at IS NULL
     ORDER BY posts.id
     LIMIT 1`,
    [seedUuid(5, '05')],
  )
  const post = posts[0]
  if (!post?.community_id || !post.created_by_id) {
    throw new Error('Missing seeded community post for first-post lookup')
  }
  await runAndCapture('first-community-post-id-index', async () => {
    const first = await isFirstCommunityPost(post.community_id, post.created_by_id, post.id)
    if (!first) throw new Error('Selected post must be the first live post in its community')
  })
}
