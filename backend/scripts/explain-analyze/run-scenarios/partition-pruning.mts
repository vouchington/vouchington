import { read } from '@data-stores/psql'
import { runAndCapture, seedPostId } from '../run-support.mts'
import { seedRelationIdAfterPost } from '../seed-data/common.mts'

export async function runPartitionPruningScenarios(): Promise<void> {
  await runAndCapture('post-child-by-post', () =>
    read(
      `/* getExplainPostChildByPost */
       SELECT topic_id, rating
       FROM post_review_topic_ratings
       WHERE post_id = $1`,
      [seedPostId],
    ),
  )

  const { rows: crawlRows } = await read<{ id: string }>(
    `/* getExplainCrawlId */ SELECT id FROM crawls ORDER BY id LIMIT 1`,
  )
  const seedCrawlId = crawlRows[0]?.id
  if (!seedCrawlId) throw new Error('EXPLAIN seed crawl is missing')
  await runAndCapture('crawl-chunks-by-crawl', () =>
    read(
      `/* getExplainCrawlChunksByCrawl */
       SELECT crawl_id, order_index
       FROM crawl_chunks
       WHERE crawl_id = $1`,
      [seedCrawlId],
    ),
  )

  await runAndCapture('entity-relation-votes-by-target', () =>
    read(
      `/* getExplainEntityRelationVotesByTarget */
       SELECT user_id
       FROM relation__post__category__topic__votes
       WHERE entity_relation_id = $1`,
      // Matches seedEntityRelations' first-inserted relation (postIndex=0, relationIndex=0).
      [seedRelationIdAfterPost(0, 0)],
    ),
  )
}
