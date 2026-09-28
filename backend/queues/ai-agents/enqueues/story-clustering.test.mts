import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  enqueueStoryClusteringBestEffort,
  enqueueBulkStoryClusteringStrict,
} from './story-clustering.mts'
import { ai_agents } from '../queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted jobs' data and deduplication options, instead of mocking the enqueue factory.
describe('ai-agent story-clustering enqueue', () => {
  it('enqueues story clustering with embedding retry data and retry delay', async () => {
    const rssFeedItemId = `rss-${randomUUID()}`

    await enqueueStoryClusteringBestEffort(rssFeedItemId, undefined, 1)

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

  it('reports only newly accepted item IDs for exact embedding generations', async () => {
    const firstId = randomUUID()
    const secondId = randomUUID()
    const first = { rss_feed_item_id: firstId, inputSha256Hex: 'a'.repeat(64) }
    const second = { rss_feed_item_id: secondId, inputSha256Hex: 'b'.repeat(64) }

    await expect(enqueueBulkStoryClusteringStrict([first])).resolves.toEqual([firstId])
    await expect(enqueueBulkStoryClusteringStrict([first, second])).resolves.toEqual([secondId])
    await expect(
      enqueueBulkStoryClusteringStrict([{ ...first, inputSha256Hex: 'c'.repeat(64) }]),
    ).resolves.toEqual([firstId])

    const jobs = await readAllQueueJobs(ai_agents)
    expect(
      jobs.filter(job => 'rss_feed_item_id' in job.data && job.data.rss_feed_item_id === firstId),
    ).toHaveLength(2)
    expect(
      jobs.find(job => 'rss_feed_item_id' in job.data && job.data.rss_feed_item_id === secondId)
        ?.data,
    ).toEqual({
      rss_feed_item_id: secondId,
    })
  })
})
