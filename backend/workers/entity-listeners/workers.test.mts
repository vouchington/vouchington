import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import {
  ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_JOBS,
  ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_POST_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_UPDATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import { JobPayloadError, parseEntityJob } from '@queues/entity-listeners/payload/job-payload'
import { entityListenersHandlers } from './workers.mts'

async function run(job: { name: string }, data: unknown) {
  const handler = entityListenersHandlers.find(candidate => candidate.job.name === job.name)
  if (!handler) throw new Error(`no handler for ${job.name}`)
  return handler.handle({ name: job.name, data } as Job)
}

describe('entity listener handlers', () => {
  it('serves every job of the domain exactly once', () => {
    expect(entityListenersHandlers.map(handler => handler.job.name).toSorted()).toEqual(
      ENTITY_LISTENERS_JOBS.map(job => job.name).toSorted(),
    )
  })

  it('rejects a follow payload on post creation before the processor runs', async () => {
    const follow = { newUserId: 'user-a', referrerId: 'user-b' }
    expect(parseEntityJob('processAutoFollowReferrer', follow)).toEqual({
      name: 'processAutoFollowReferrer',
      data: follow,
    })
    await expect(run(ENTITY_LISTENERS_POST_CREATED_JOB, follow)).rejects.toBeInstanceOf(
      JobPayloadError,
    )
  })

  it('accepts nullable topic ids and rejects that payload on topic update', async () => {
    const created = {
      id: 'topic',
      updates: { name: 'Travel', slug: 'travel', homepage_url_id: null, hostname: null },
    }
    expect(parseEntityJob('processTopicCreated', created).data).toEqual(created)
    expect(ENTITY_LISTENERS_TOPIC_CREATED_JOB.name).toBe('entity-listeners.processTopicCreated')
    await expect(run(ENTITY_LISTENERS_TOPIC_UPDATED_JOB, created)).rejects.toBeInstanceOf(
      JobPayloadError,
    )
  })

  it('starts a reconciliation sweep from the scheduled enqueue job', async () => {
    const add = vi.spyOn(entitiesListeners, 'add').mockResolvedValueOnce({ id: 'root' } as never)
    try {
      await run(ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB, {})
      expect(add).toHaveBeenCalledExactlyOnceWith(
        ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name,
        {},
        expect.objectContaining({
          deduplication: { id: 'entity-reconciliation-dispatcher', mode: 'simple' },
        }),
      )
    } finally {
      add.mockRestore()
    }
  })

  it('saves the fixed window of a reconciliation sweep page on its job', async () => {
    const updateData = vi.fn<(data: unknown) => Promise<void>>().mockResolvedValue()
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<void>>().mockResolvedValue()
    const handler = entityListenersHandlers.find(
      candidate => candidate.job.name === ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name,
    )

    await handler!.handle({
      name: ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name,
      data: {},
      updateData,
      moveToDelayed,
    } as unknown as Job)

    expect(updateData).toHaveBeenCalledWith({
      window: { start: expect.any(String), end: expect.any(String) },
    })
  })

  it('rejects an unknown local job name', () => {
    expect(() => parseEntityJob('processSendWelcomeEmail', {})).toThrow(JobPayloadError)
  })
})
