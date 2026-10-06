import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { JobPayloadError, parseEntityJob } from '@queues/entity-listeners/payload/job-payload'
import { dispatchEntityListenerJob, entitiesListeners } from './workers.mts'

describe('entity listener dispatch', () => {
  afterAll(async () => {
    await entitiesListeners.close()
  })

  it('runs an empty image-updated job', async () => {
    await expect(
      dispatchEntityListenerJob({ name: 'processImageUpdated', data: {} } as Job),
    ).resolves.toBeUndefined()
  })

  it('rejects a post id on the image-updated job before the processor returns', async () => {
    await expect(
      dispatchEntityListenerJob({ name: 'processImageUpdated', data: { id: 'post-1' } } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('rejects an unknown job name', async () => {
    await expect(
      dispatchEntityListenerJob({ name: 'processSendWelcomeEmail', data: {} } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('accepts nullable topic ids and rejects that payload on topic update', async () => {
    const created = {
      id: 'topic',
      updates: { name: 'Travel', slug: 'travel', homepage_url_id: null, hostname: null },
    }
    expect(parseEntityJob('processTopicCreated', created).data).toEqual(created)
    await expect(
      dispatchEntityListenerJob({ name: 'processTopicUpdated', data: created } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('accepts a follow payload and rejects the same object on post creation', async () => {
    const follow = { newUserId: 'user-a', referrerId: 'user-b' }
    expect(parseEntityJob('processAutoFollowReferrer', follow)).toEqual({
      name: 'processAutoFollowReferrer',
      data: follow,
    })
    await expect(
      dispatchEntityListenerJob({ name: 'processPostCreated', data: follow } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })
})
