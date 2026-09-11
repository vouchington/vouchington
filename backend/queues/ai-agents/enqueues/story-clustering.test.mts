import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueStoryClustering } from './story-clustering.mts'
import { enqueueBulkWikipediaRecommender } from './wikipedia-recommender.mts'
import { ai_agents } from '../queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted jobs' data and deduplication options, instead of mocking the enqueue factory.
describe('ai-agent story-clustering and wikipedia recommender enqueues', () => {
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

  it('enqueues wikipedia recommender with stable deduplication independent of entity order', async () => {
    const entityIds = [`post-${randomUUID()}`, `post-${randomUUID()}`]

    await enqueueBulkWikipediaRecommender([{ entityType: 'post', entityIds }])

    const waiting = await readAllQueueJobs(ai_agents)
    const job = waiting.find(j => isWikipediaJobForEntityIds(j, entityIds))
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ entity_type: 'post', entity_ids: entityIds })
    expect(job!.opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 1000, type: 'exponential' },
      priority: 25,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: {
        mode: 'debounce',
        ttl: 60_000,
      },
    })
    const deduplicationId = getDeduplicationId(job!)
    expect(deduplicationId).toMatch(/^wikipedia_recommender_post_[a-f0-9]{64}$/)

    await enqueueBulkWikipediaRecommender([
      { entityType: 'post', entityIds: [...entityIds].reverse() },
    ])

    const reorderedJobs = (await readAllQueueJobs(ai_agents)).filter(j =>
      isWikipediaJobForEntityIds(j, entityIds),
    )
    expect(new Set(reorderedJobs.map(getDeduplicationId))).toEqual(new Set([deduplicationId]))
  })
})

function isWikipediaJobForEntityIds(
  job: { name: string; data: unknown },
  entityIds: string[],
): boolean {
  const jobEntityIds = (job.data as { entity_ids?: string[] }).entity_ids ?? []
  return job.name === 'wikipedia-recommender' && entityIds.every(id => jobEntityIds.includes(id))
}

function getDeduplicationId(job: { opts: unknown }): string | undefined {
  return (job.opts as { deduplication?: { id?: string } }).deduplication?.id
}
