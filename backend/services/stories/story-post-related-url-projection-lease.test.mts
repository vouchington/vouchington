import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as psql from '@data-stores/psql'
import {
  createTestUserDirect,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { upsertSystemUser } from '@services/users/system-users'
import { createTestStoryProjectionLease } from '../../test-helpers/entities/story-projection-work.mts'
import { runWithStoryPostRelatedUrlProjectionLeaseRenewal } from './story-post-related-url-projection-lease.mts'
import { releaseStoryPostRelatedUrlProjectionWork } from './story-post-related-url-projection-work.mts'
import { prepareStoryPost } from './story-posts.mts'

const RENEWAL_MARKER = 'renewStoryPostRelatedUrlProjectionWorkLease'

describe('story post related URL projection lease renewal', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function leaseOwnedWork() {
    const suffix = crypto.randomUUID()
    const [user, story, url] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Lease renewal ${suffix}` }),
      insertTestUrlDirect(null, `https://lease-renewal-${suffix}.example.test/article`),
    ])
    if (!user || !url) throw new Error('Expected lease renewal fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
    const prepared = await prepareStoryPost(story.id, user)
    const work = await createTestStoryProjectionLease(prepared.response.post.id)
    if (!work) throw new Error('Expected a projection lease for the prepared story post')
    return work
  }

  /** Record each real renewal write so a test can wait for exactly the one it triggered. */
  function trackRenewals(): Promise<unknown>[] {
    const renewals: Promise<unknown>[] = []
    const realWrite = psql.write
    vi.spyOn(psql, 'write').mockImplementation((query, ...rest) => {
      const result = realWrite(query, ...rest)
      const text = typeof query === 'string' ? query : query.text
      if (text.includes(RENEWAL_MARKER)) renewals.push(result)
      return result
    })
    return renewals
  }

  it('renews the exact lease while URL screening is still running', async () => {
    const work = await leaseOwnedWork()
    const renewals = trackRenewals()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const screening = Promise.withResolvers<string>()
    const running = runWithStoryPostRelatedUrlProjectionLeaseRenewal(work, () => screening.promise)

    await Promise.all(renewals)
    await vi.advanceTimersByTimeAsync(0)
    expect(renewals).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(renewals).toHaveLength(2)
    await Promise.all(renewals)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(renewals).toHaveLength(3)
    await Promise.all(renewals)
    screening.resolve('safe')

    await expect(running).resolves.toEqual({ value: 'safe' })
    expect(renewals).toHaveLength(4)
  })

  it('fails closed when a periodic renewal loses ownership', async () => {
    const work = await leaseOwnedWork()
    const renewals = trackRenewals()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const screening = Promise.withResolvers<string>()
    const running = runWithStoryPostRelatedUrlProjectionLeaseRenewal(work, () => screening.promise)

    await Promise.all(renewals)
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    await releaseStoryPostRelatedUrlProjectionWork(work)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(renewals).toHaveLength(2)
    await Promise.all(renewals)
    screening.resolve('stale')

    await expect(running).resolves.toBeNull()
  })

  it('does not run the operation when the lease is already lost', async () => {
    const work = await leaseOwnedWork()
    await releaseStoryPostRelatedUrlProjectionWork(work)
    const operation = vi.fn<(leased: typeof work) => Promise<string>>()

    await expect(
      runWithStoryPostRelatedUrlProjectionLeaseRenewal(work, operation),
    ).resolves.toBeNull()
    expect(operation).not.toHaveBeenCalled()
  })

  it('surfaces a renewal failure instead of running the operation', async () => {
    const work = await leaseOwnedWork()
    const failure = new Error('renewal write failed')
    const operation = vi.fn<(leased: typeof work) => Promise<string>>()
    const restore = rejectPostgresWriteForTest(RENEWAL_MARKER, failure)

    try {
      await expect(runWithStoryPostRelatedUrlProjectionLeaseRenewal(work, operation)).rejects.toBe(
        failure,
      )
    } finally {
      restore()
    }
    expect(operation).not.toHaveBeenCalled()
  })
})
