import { read } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { isFirstCommunityPost } from '@services/communities/ban-evasion'
import { reconcilePendingStoryClusteringEmbeddingTriggers } from '@services/stories/embedding-trigger'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runEmbeddingReconciliationScenarios(): Promise<void> {
  const { rows: boundaries } = await read<{ id: string }>(`/* explainEmbeddingRecoveryBoundary */
    SELECT id FROM (
      SELECT items.id, row_number() OVER (ORDER BY items.id) AS row_index
      FROM rss_feed_items items
      JOIN rss_feed_item_ids ids ON ids.id = items.id
      WHERE ids.guid LIKE 'seed-item-guid-%'
    ) seeded
    WHERE row_index = 20000`)
  const boundary = boundaries[0]?.id
  if (!boundary) throw new Error('Missing late RSS embedding recovery boundary')
  const after = encodeScopedUuidCursor(boundary, 'stories:embedding-trigger:pending:id-asc')

  await runAndCapture(
    'rss-story-embedding-pending-late-page',
    async () => {
      const page = await reconcilePendingStoryClusteringEmbeddingTriggers(
        { after, limit: 100 },
        { enqueueStrict: async () => [] },
      )
      if (page.scannedCount !== 100 || page.nextCursor === null) {
        throw new Error(`Expected 100 pending late RSS candidates, found ${page.scannedCount}`)
      }
    },
    undefined,
    'reconcilePendingStoryClusteringEmbeddingTriggers',
  )

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
