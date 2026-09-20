import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueStoryClustering } from './story-clustering.mts'
import { ai_agents } from '../queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted jobs' data and deduplication options, instead of mocking the enqueue factory.
describe('ai-agent story-clustering enqueue', () => {
  it('enqueues story clustering with embedding retry data and retry delay', async () => {
    const rssFeedItemId = `rss-${randomUUID()}`

    await enqueueStoryClustering(rssFeedItemId, undefined, 1)

    const waiting = await readAllQueueJobs(ai_agents)
    const job = waiting.find(
      j => (j.data as { rss_feed_item_id?: string }).rss_feed_item_id === rssFeedItemId,
    )
    expect(job).toBeDefined()
    expect(job!.name).toBe('story-clustering')
    expect(job!.data).toEqual({ rss_feed_item_id: rssFeedItemId, embedding_retries: 1 })
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
})
