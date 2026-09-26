import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueStoryClustering } from './story-clustering.mts'
import { ai_agents } from '../queues.mts'
import type { StoryClusteringJobData } from '../types.mts'

function findJob<T extends { id: string; timestamp: number }>(
  waiting: T[],
  rssFeedItemId: string,
): T | undefined {
  return waiting.find(
    j => (j as { data?: { rss_feed_item_id?: string } }).data?.rss_feed_item_id === rssFeedItemId,
  )
}

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted jobs' data and deduplication options, instead of mocking the enqueue factory.
describe('ai-agent story-clustering enqueue', () => {
  it('enqueues story clustering with embedding retry data, retry delay, and a minted batch id', async () => {
    const rssFeedItemId = `rss-${randomUUID()}`

    await enqueueStoryClustering(rssFeedItemId, undefined, 1)

    const waiting = await readAllQueueJobs(ai_agents)
    const job = findJob(waiting, rssFeedItemId)
    expect(job).toBeDefined()
    expect(job!.name).toBe('story-clustering')
    const data = job!.data as StoryClusteringJobData
    expect(data.rss_feed_item_id).toBe(rssFeedItemId)
    expect(data.embedding_retries).toBe(1)
    // Minted fresh (uuidv7) since no batchId override was passed -- asserted as shape, not a
    // pinned value, since it's random per run.
    expect(data.batch_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
    expect(job!.opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 1000, type: 'exponential' },
      delay: 5_000,
      priority: 15,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: {
        id: `story_clustering_retry_${rssFeedItemId}`,
        mode: 'debounce',
      },
    })
  })

  it('preserves a caller-supplied batch id instead of minting a new one', async () => {
    const rssFeedItemId = `rss-${randomUUID()}`
    const batchId = randomUUID()

    await enqueueStoryClustering(rssFeedItemId, undefined, 2, batchId)

    const waiting = await readAllQueueJobs(ai_agents)
    const job = findJob(waiting, rssFeedItemId)
    expect(job).toBeDefined()
    expect((job!.data as StoryClusteringJobData).batch_id).toBe(batchId)
  })
})
