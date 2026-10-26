import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createTestTopic } from '@voucha/test-helpers'
import {
  ENTITY_LISTENERS_JOBS,
  ENTITY_LISTENERS_POST_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_CREATED_JOB,
  ENTITY_LISTENERS_TOPIC_DELETED_JOB,
  ENTITY_LISTENERS_TOPIC_UPDATED_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import { JobPayloadError, parseEntityJob } from '@queues/entity-listeners/payload/job-payload'
import { TOP_HASHTAGS_VIEW } from '@queues/psql/config'
import { psql } from '@queues/psql/queues'
import { caches } from '@services/entity-cache/caches'
import { getTopicByAny } from '@services/topics/get'
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

  it('replays a deleted topic by evicting its owned cache and requesting one hashtag refresh', async () => {
    const topic = await createTestTopic()
    const current = await getTopicByAny(topic.id)
    if (!current) throw new Error('Test topic was not persisted')

    const originalAdd = psql.add
    const refreshAttempts: Array<{ name: string; data: unknown; opts: unknown }> = []
    const observedRefresh = Promise.withResolvers<void>()
    const add = vi.spyOn(psql, 'add').mockImplementation((name, data, opts) => {
      if (
        name !== 'refreshMaterializedView' ||
        typeof data !== 'object' ||
        data === null ||
        !('viewName' in data) ||
        data.viewName !== TOP_HASHTAGS_VIEW
      ) {
        return originalAdd.call(psql, name, data, opts)
      }
      refreshAttempts.push({ name, data, opts })
      observedRefresh.resolve()
      return Promise.resolve(null)
    })

    try {
      await caches.topics.set(topic.id, current)
      expect(await caches.topics.get(topic.id)).toMatchObject({ id: topic.id })
      await run(ENTITY_LISTENERS_TOPIC_DELETED_JOB, {
        id: topic.id,
        updates: { name: topic.name, slug: topic.slug },
      })
      await observedRefresh.promise
      expect(await caches.topics.get(topic.id)).toBeNull()
      expect(refreshAttempts).toEqual([
        {
          name: 'refreshMaterializedView',
          data: { viewName: TOP_HASHTAGS_VIEW },
          opts: expect.objectContaining({ priority: 10 }),
        },
      ])
    } finally {
      add.mockRestore()
      await caches.topics.delete(topic.id)
    }
  })

  it('rejects an unknown local job name', () => {
    expect(() => parseEntityJob('processSendWelcomeEmail', {})).toThrow(JobPayloadError)
  })
})
