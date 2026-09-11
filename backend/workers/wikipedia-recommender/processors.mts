import { getRecentContentIds } from '@services/wikipedia-topic-recommendations/database'
import type { SourceEntityType } from '@services/wikipedia-topic-recommendations'
import { enqueueBulkWikipediaRecommender } from '@queues/ai-agents/enqueues/wikipedia-recommender'
import { BATCH_SIZE } from '@queues/wikipedia-recommender/config'
import type { DispatchJobData } from '@queues/wikipedia-recommender/types'

/**
 * Chunks an array into smaller arrays of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Dispatcher: Queries recent content and enqueues worker batches
 * Note: RSS support not implemented - posts only for now
 */
type WikipediaRecommenderDependencies = {
  enqueueBulkWikipediaRecommender: typeof enqueueBulkWikipediaRecommender
  getRecentContentIds: typeof getRecentContentIds
}

export async function processDispatchDispatcher(
  _data: DispatchJobData,
  dependencies?: Partial<WikipediaRecommenderDependencies>,
): Promise<void> {
  const getRecentIds = dependencies?.getRecentContentIds ?? getRecentContentIds
  const enqueueBulk =
    dependencies?.enqueueBulkWikipediaRecommender ?? enqueueBulkWikipediaRecommender
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { postIds } = await getRecentIds(twentyFourHoursAgo)

  const batches: Array<{ entityType: SourceEntityType; entityIds: string[] }> = []

  // Create post batches
  if (postIds.length > 0) {
    const postChunks = chunkArray<string>(postIds, BATCH_SIZE)
    for (const chunk of postChunks) {
      batches.push({ entityType: 'post', entityIds: chunk })
    }
  }

  // Enqueue all batches at once
  if (batches.length > 0) {
    await enqueueBulk(batches)
  }
}
