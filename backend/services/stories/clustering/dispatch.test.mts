import { randomUUID } from 'node:crypto'
import { ai_agents } from '@queues/ai-agents/queues'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { STORY_CLUSTERING_CLASSIFIER_SLUG as SLUG } from '@voucha/types/entities/story-clustering-classifier'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
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
        id: `classifier_run_dispatcher_${SLUG}_${rssFeedItemId}`,
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
})

describe('dispatchStoryClusteringForEmbeddedItems failure handling', () => {
  it('does not fail the embedding job that already stored its vector when the queue rejects', async () => {
    const rssFeedItemId = randomUUID()
    const addBulk = vi.spyOn(ai_agents, 'addBulk').mockRejectedValue(new Error('queue unavailable'))
    onTestFinished(() => addBulk.mockRestore())

    await expect(dispatchStoryClusteringForEmbeddedItems([rssFeedItemId])).resolves.toBeUndefined()

    expect(addBulk).toHaveBeenCalled()
    expect(await dispatchersFor(rssFeedItemId)).toHaveLength(0)
  })

  it('never touches the queue for an empty list', async () => {
    const addBulk = vi.spyOn(ai_agents, 'addBulk')
    onTestFinished(() => addBulk.mockRestore())

    await expect(dispatchStoryClusteringForEmbeddedItems([])).resolves.toBeUndefined()

    expect(addBulk).not.toHaveBeenCalled()
  })
})
