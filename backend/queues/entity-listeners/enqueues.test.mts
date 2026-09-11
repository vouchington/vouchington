import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueBulkOnPostUpdated,
  enqueueBulkReconcileEntities,
  enqueueContinuePostCategoryFinalizations,
  enqueueReconcilePostCategoryFinalizations,
  enqueueOnTopicDeleted,
} from './enqueues.mts'
import { entitiesListeners } from './queues.mts'

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

describe('entity listener enqueues', () => {
  it('enqueues each post update with the requested priority', async () => {
    const postA = randomUUID()
    const postB = randomUUID()

    await enqueueBulkOnPostUpdated([{ id: postA, contentChanged: true }, { id: postB }], 37)

    const postIds = new Set<string>([postA, postB])
    const jobs = (await getAllEntityListenerJobs()).filter(
      job =>
        job.name === 'processPostUpdated' && postIds.has((job.data as { id?: string })?.id ?? ''),
    )

    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'processPostUpdated',
          data: { id: postA, contentChanged: true },
          opts: expect.objectContaining({ priority: 37 }),
        }),
        expect.objectContaining({
          name: 'processPostUpdated',
          data: { id: postB },
          opts: expect.objectContaining({ priority: 37 }),
        }),
      ]),
    )
  })

  it('enqueues a topic deletion with its updates and requested priority', async () => {
    const topicId = randomUUID()
    const updates = { name: 'Deleted topic', slug: 'deleted-topic' }

    await enqueueOnTopicDeleted(topicId, updates, 41)

    const jobs = (await getAllEntityListenerJobs()).filter(
      candidate =>
        candidate.name === 'processTopicDeleted' &&
        (candidate.data as { id?: string })?.id === topicId,
    )

    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ id: topicId, updates })
    expect(jobs[0]!.opts).toMatchObject({ priority: 41 })
  })

  it('uses the database-derived logical id for reconciliation job and dedup ids', async () => {
    const entityId = randomUUID()
    const changedAtEpochUs = '1784304000123456'
    const jobId = `entity-reconcile__user__${entityId}__${changedAtEpochUs}`
    await enqueueBulkReconcileEntities([{ entityType: 'user', entityId, changedAtEpochUs }])
    const job = (await getAllEntityListenerJobs()).find(candidate => candidate.id === jobId)
    expect(job).toMatchObject({
      id: jobId,
      name: 'reconcileEntity',
      data: { entityType: 'user', entityId, changedAtEpochUs },
      opts: { priority: 10, deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('uses the revision id for distinct post replay jobs', async () => {
    const entityId = randomUUID()
    const changeId = randomUUID()
    const data = {
      entityType: 'post_updated' as const,
      entityId,
      changedAtEpochUs: '1784304000123456',
      changeId,
      contentChanged: true,
    }
    const jobId = `entity-reconcile__post_updated__${entityId}__${changeId}`
    await enqueueBulkReconcileEntities([data])
    expect(
      (await getAllEntityListenerJobs()).find(candidate => candidate.id === jobId),
    ).toMatchObject({
      id: jobId,
      data,
      opts: { deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('enqueues the durable post-category finalization recovery job', async () => {
    await enqueueReconcilePostCategoryFinalizations()

    expect(
      (await getAllEntityListenerJobs()).find(
        candidate => candidate.name === 'processReconcilePostCategoryFinalizations',
      ),
    ).toMatchObject({
      name: 'processReconcilePostCategoryFinalizations',
      data: {},
      opts: {
        priority: 100,
        deduplication: {
          id: 'entity-listeners:reconcile-post-category-finalizations',
          mode: 'throttle',
        },
        ordering: { key: 'post-category-finalization-reconciliation', concurrency: 1 },
      },
    })
  })

  it('enqueues an unthrottled serialized continuation for a full finalization batch', async () => {
    await enqueueContinuePostCategoryFinalizations()

    expect(
      (await getAllEntityListenerJobs()).find(
        candidate =>
          candidate.name === 'processReconcilePostCategoryFinalizations' &&
          !candidate.opts?.deduplication,
      ),
    ).toMatchObject({
      name: 'processReconcilePostCategoryFinalizations',
      data: {},
      opts: {
        priority: 100,
        ordering: { key: 'post-category-finalization-reconciliation', concurrency: 1 },
      },
    })
  })
})

describe('enqueueBulkOnPostUpdated (fault injection)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects the awaited handoff when the bulk enqueue call rejects', async () => {
    const enqueueError = new Error('bulk enqueue rejected')
    vi.spyOn(entitiesListeners, 'addBulk').mockRejectedValueOnce(enqueueError)

    await expect(
      enqueueBulkOnPostUpdated([{ id: randomUUID(), contentChanged: true }]),
    ).rejects.toThrow(enqueueError)
  })
})

async function getAllEntityListenerJobs() {
  return (await Promise.all(QUEUE_STATES.map(state => entitiesListeners.getJobs(state)))).flat()
}
