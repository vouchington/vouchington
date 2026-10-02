import { randomUUID } from 'node:crypto'
import { ai_agents } from '@queues/ai-agents/queues'
import {
  classifierRunDispatcherJobId,
  type enqueueBulkClassifierRunDispatchers,
} from '@queues/ai-agents/enqueues/classifier-run'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { STORY_CLUSTERING_CLASSIFIER_SLUG as SLUG } from '@voucha/types/entities/story-clustering-classifier'
import { describe, expect, it, vi } from 'vitest'
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

describe('dispatchStoryClusteringForEmbeddedItems failure handling', () => {
  function failingQueue(rejection: unknown) {
    return {
      enqueue: vi.fn<typeof enqueueBulkClassifierRunDispatchers>().mockRejectedValue(rejection),
      report: vi.fn<(error: Error) => void>(),
    }
  }

  it('reports an enqueue failure instead of failing the embedding job that already stored its vector', async () => {
    const { enqueue, report } = failingQueue(new Error('queue unavailable'))

    await expect(
      dispatchStoryClusteringForEmbeddedItems([randomUUID()], enqueue, report),
    ).resolves.toBeUndefined()

    expect(report).toHaveBeenCalledExactlyOnceWith(new Error('queue unavailable'))
  })

  it('wraps a non-error rejection so the report is always an Error', async () => {
    const { enqueue, report } = failingQueue('boom')

    await dispatchStoryClusteringForEmbeddedItems([randomUUID()], enqueue, report)

    expect(report).toHaveBeenCalledExactlyOnceWith(new Error('boom'))
  })

  it('never touches the queue for an empty list', async () => {
    const { enqueue, report } = failingQueue(new Error('unreachable'))

    await dispatchStoryClusteringForEmbeddedItems([], enqueue, report)

    expect(enqueue).not.toHaveBeenCalled()
  })
})
