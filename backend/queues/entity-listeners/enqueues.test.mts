import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENTITY_LISTENERS_POST_UPDATED_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITY_JOB,
  ENTITY_LISTENERS_TOPIC_DELETED_JOB,
  ENTITY_LISTENERS_URL_CREATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import { readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import {
  enqueueBulkOnPostUpdated,
  enqueueBulkOnUrlCreated,
  enqueueBulkReconcileEntities,
  enqueueOnPostCreated,
  enqueueOnTopicDeleted,
} from './enqueues.mts'
import {
  enqueueReconcileEntities,
  entityReconciliationRootOptions,
} from './enqueues/reconciliation.mts'
import { entitiesListeners } from './queues.mts'

describe('entity listener enqueues', () => {
  it('enqueues each post update with the requested priority', async () => {
    const postA = randomUUID()
    const postB = randomUUID()

    await enqueueBulkOnPostUpdated([{ id: postA, contentChanged: true }, { id: postB }], 37)

    const jobs = (
      await Promise.all(
        [postA, postB].map(id =>
          entitiesListeners.searchJobs({
            name: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
            data: { id },
          }),
        ),
      )
    ).flat()

    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
          data: { id: postA, contentChanged: true },
          opts: expect.objectContaining({ priority: 37 }),
        }),
        expect.objectContaining({
          name: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
          data: { id: postB },
          opts: expect.objectContaining({ priority: 37 }),
        }),
      ]),
    )
  })

  it('takes the task priority from the job definition when the caller gives none', async () => {
    const postId = randomUUID()
    const job = await readEnqueuedJob(entitiesListeners, await enqueueOnPostCreated(postId))
    expect(job.name).toBe('entity-listeners.processPostCreated')
    expect(job.opts.priority).toBe(10)
  })

  it('enqueues a topic deletion with its updates and requested priority', async () => {
    const topicId = randomUUID()
    const updates = { name: 'Deleted topic', slug: 'deleted-topic' }

    await enqueueOnTopicDeleted(topicId, updates, 41)

    const jobs = await entitiesListeners.searchJobs({
      name: ENTITY_LISTENERS_TOPIC_DELETED_JOB.name,
      data: { id: topicId },
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ id: topicId, updates })
    expect(jobs[0]!.opts).toMatchObject({ priority: 41 })
  })

  it('debounces a created url per id and defaults to the task priority', async () => {
    const urlId = randomUUID()
    await enqueueBulkOnUrlCreated([urlId])
    const [job] = await entitiesListeners.searchJobs({
      name: ENTITY_LISTENERS_URL_CREATED_JOB.name,
      data: { id: urlId },
    })
    expect(job).toMatchObject({
      data: { id: urlId },
      opts: {
        priority: 10,
        deduplication: { id: `processUrlCreated__${urlId}`, mode: 'debounce' },
      },
    })
  })

  it('enqueues a created url at the requested priority', async () => {
    const urlId = randomUUID()
    await enqueueBulkOnUrlCreated([urlId], 41)
    const [job] = await entitiesListeners.searchJobs({
      name: ENTITY_LISTENERS_URL_CREATED_JOB.name,
      data: { id: urlId },
    })
    expect(job!.opts).toMatchObject({ priority: 41 })
  })

  it('admits one deduplicated reconciliation root for the sweep', async () => {
    const add = vi.spyOn(entitiesListeners, 'add').mockResolvedValueOnce({ id: 'root' } as never)
    try {
      await enqueueReconcileEntities()
      expect(add).toHaveBeenCalledExactlyOnceWith(
        ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name,
        {},
        expect.objectContaining({
          jobId: expect.stringMatching(/^entity-reconciliation-dispatcher__/),
          deduplication: { id: 'entity-reconciliation-dispatcher', mode: 'simple' },
        }),
      )
    } finally {
      add.mockRestore()
    }
  })

  it('uses the database-derived logical id for reconciliation job and dedup ids', async () => {
    const entityId = randomUUID()
    const changedAtEpochUs = '1784304000123456'
    const jobId = `entity-reconcile__user__${entityId}__${changedAtEpochUs}`
    await enqueueBulkReconcileEntities([{ entityType: 'user', entityId, changedAtEpochUs }])
    const job = await entitiesListeners.getJob(jobId)
    expect(job).toMatchObject({
      id: jobId,
      name: ENTITY_LISTENERS_RECONCILE_ENTITY_JOB.name,
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
    expect(await entitiesListeners.getJob(jobId)).toMatchObject({
      id: jobId,
      data,
      opts: { deduplication: { id: jobId, mode: 'simple' } },
    })
  })

  it('gives every reconciliation root a unique id under one shared deduplication id', () => {
    const [first, second] = [entityReconciliationRootOptions(), entityReconciliationRootOptions()]
    expect(first.jobId).toMatch(/^entity-reconciliation-dispatcher__/)
    expect(first.jobId).not.toBe(second.jobId)
    expect(first.deduplication).toEqual({ id: 'entity-reconciliation-dispatcher', mode: 'simple' })
    expect(ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.options).toMatchObject({
      priority: 100,
      attempts: 3,
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
