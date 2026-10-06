import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
import * as cachePurgeEnqueues from '@queues/cache-purge/enqueues'
import { cachePurge } from '@queues/cache-purge/queues'
import { createMyLandingPage } from './create.mts'

describe('createMyLandingPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await cachePurge.obliterate({ force: true })
  })

  it('enqueues a user cache purge tag for the public landing page routes', async () => {
    const user = await createTestUser()
    const pending: Promise<unknown>[] = []
    const enqueue = cachePurgeEnqueues.enqueueBulkPurgeCacheTags
    vi.spyOn(cachePurgeEnqueues, 'enqueueBulkPurgeCacheTags').mockImplementation((...args) => {
      const job = enqueue(...args)
      pending.push(job)
      return job
    })

    await createMyLandingPage(user.id, { title: 'Landing page cache test', slug: 'cache-test' })
    await Promise.all(pending)

    const tags = (await readAllQueueJobs(cachePurge)).flatMap(
      job => (job.data as { tags?: unknown[] } | undefined)?.tags ?? [],
    )
    expect(tags).toEqual(expect.arrayContaining([`user:${user.username!}`]))
  })
})
