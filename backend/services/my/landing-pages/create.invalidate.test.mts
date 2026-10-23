import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import * as cachePurgeEnqueues from '@queues/cache-purge/enqueues'
import { cachePurge } from '@queues/cache-purge/queues'
import { createMyLandingPage } from './create.mts'

describe('createMyLandingPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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

    const tags = (await cachePurge.searchJobs({ name: CACHE_PURGE_TAGS_JOB.name })).flatMap(
      job => (job.data as { tags?: unknown[] } | undefined)?.tags ?? [],
    )
    expect(tags).toEqual(expect.arrayContaining([`user:${user.username!}`]))
  })
})
