import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { findYourFriendsWorkConfig } from './config.mts'
import {
  enqueueBulkSyncGithubFriends,
  enqueueDispatchFindYourFriends,
  enqueueSyncFacebookFriends,
  enqueueSyncXFriends,
} from './enqueues.mts'
import { findYourFriendsQueue } from './queues.mts'

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the emitted
// jobs' names, ordering lanes and deduplication options, instead of mocking the enqueue factory.
describe('find-your-friends enqueue helpers', () => {
  it('enqueues a facebook sync in its own namespaced lane with its rate limit', async () => {
    const facebookUserId = `facebook-${randomUUID()}`

    await enqueueSyncFacebookFriends(facebookUserId)

    const jobs = (await readAllQueueJobs(findYourFriendsQueue)).filter(
      job => (job.data as { facebookUserId?: string }).facebookUserId === facebookUserId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.name).toBe('find-your-friends.syncFacebookFriends')
    expect(jobs[0]!.opts).toMatchObject({
      attempts: 3,
      priority: 10,
      ordering: {
        key: 'find-your-friends:sync_facebook',
        concurrency: 5,
        rateLimit: { max: 5, duration: 1_000 },
      },
      deduplication: { id: `sync_facebook__${facebookUserId}`, mode: 'throttle', ttl: 300_000 },
    })
  })

  it('keeps the x lane at its tighter concurrency and rate limit', async () => {
    const xUserId = `x-${randomUUID()}`

    await enqueueSyncXFriends(xUserId)

    const jobs = (await readAllQueueJobs(findYourFriendsQueue)).filter(
      job => (job.data as { xUserId?: string }).xUserId === xUserId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.opts).toMatchObject({
      ordering: {
        key: 'find-your-friends:sync_x',
        concurrency: 2,
        rateLimit: { max: 1, duration: 2_000 },
      },
    })
  })

  it('bulk-enqueues every id in batches bounded by the enqueue batch size', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(findYourFriendsWorkConfig, { enqueue_batch_size: 2 }),
    )
    const ids = Array.from({ length: 5 }, () => `github-${randomUUID()}`)

    await enqueueBulkSyncGithubFriends(ids)

    const jobs = (await readAllQueueJobs(findYourFriendsQueue)).filter(job =>
      ids.includes((job.data as { githubUserId?: string }).githubUserId ?? ''),
    )
    expect(jobs.map(job => (job.data as { githubUserId: string }).githubUserId).toSorted()).toEqual(
      ids.toSorted(),
    )
    for (const job of jobs) {
      expect(job.name).toBe('find-your-friends.syncGithubFriends')
      expect(job.opts.ordering).toMatchObject({ key: 'find-your-friends:sync_github' })
    }
  })

  it('enqueues the dispatcher at dispatcher priority with a simple dedup id and no lane', async () => {
    const job = await enqueueDispatchFindYourFriends()

    expect(job).toMatchObject({
      name: 'find-your-friends.dispatchFindYourFriends',
      opts: { priority: 100, deduplication: { id: 'friends-dispatcher', mode: 'simple' } },
    })
    expect((job as { opts: { ordering?: unknown } }).opts.ordering).toBeUndefined()
  })
})
