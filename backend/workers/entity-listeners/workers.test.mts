import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  ENTITY_LISTENERS_JOBS,
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

  it('rejects an unknown local job name', () => {
    expect(() => parseEntityJob('processSendWelcomeEmail', {})).toThrow(JobPayloadError)
  })
})
