import { randomUUID } from 'node:crypto'
import { ai_agents } from '@queues/ai-agents/queues'
import { classifierRunDispatcherJobId } from '@queues/ai-agents/enqueues/classifier-run'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { STORY_CLUSTERING_CLASSIFIER_SLUG as SLUG } from '@voucha/types/entities/story-clustering-classifier'
import { describe, expect, it } from 'vitest'
import { dispatchStoryClusteringForEmbeddedItems } from './dispatch.mts'

async function dispatchersFor(rssFeedItemId: string) {
  const jobs = await readAllQueueJobs(ai_agents)
  return jobs.filter(
    job =>
      job.name === 'classifier-run-dispatcher' &&
      (job.data as { rssFeedItemId?: string }).rssFeedItemId === rssFeedItemId,
  )
}

describe('dispatchStoryClusteringForEmbeddedItems (real queue)', () => {
  it('starts one story-clustering dispatcher per item, keyed by the stable per-item job id', async () => {
    const [first, second] = [randomUUID(), randomUUID()]

    await dispatchStoryClusteringForEmbeddedItems([first, second])

    for (const rssFeedItemId of [first, second]) {
      const jobs = await dispatchersFor(rssFeedItemId)
      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        id: classifierRunDispatcherJobId({
          classifier: SLUG,
          postId: null,
          rssFeedItemId,
        }),
        data: { classifier: SLUG, postId: null, rssFeedItemId },
      })
    }
  })

  it('adds the dispatcher once however many embedding paths report the same item', async () => {
    const rssFeedItemId = randomUUID()

    await dispatchStoryClusteringForEmbeddedItems([rssFeedItemId])
    await dispatchStoryClusteringForEmbeddedItems([rssFeedItemId, rssFeedItemId])

    expect(await dispatchersFor(rssFeedItemId)).toHaveLength(1)
  })

  it('does nothing for an empty list', async () => {
    await expect(dispatchStoryClusteringForEmbeddedItems([])).resolves.toBeUndefined()
  })
})
