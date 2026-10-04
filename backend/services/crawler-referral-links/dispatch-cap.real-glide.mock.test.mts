import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { getDateFromUUIDv7 } from '@modules/utils'
import {
  createTestUser,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import { setReferralLinkLastCrawlSuccessAtRecent } from '@voucha/test-helpers/entities/referral-links'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import type { ReferralCrawlDispatchData } from '@queues/crawl-referral-links/types'
import { referralCrawlDispatchConfig } from './work-limits.mts'
import { dispatchReferralLinkCrawls, enqueueReferralLinkCrawlsForUrlId } from './dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('bounded referral crawl dispatch', () => {
  afterEach(() => vi.useRealTimers())
  afterAll(() => crawlReferralLinksQueue.close())

  it('preserves selected IDs across capped scheduled continuations', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const ids = (
      await Promise.all(
        Array.from({ length: 3 }, async () =>
          insertTestUserReferralProgramLink({
            userId: owner.id,
            referralProgramId,
            urlId: await createTestUrlWithHostname(),
          }),
        ),
      )
    ).toSorted()
    overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    const computeHostnameRateLimitMs = async () => 1
    expect(
      await dispatchReferralLinkCrawls({ referralLinkIds: ids, computeHostnameRateLimitMs }),
    ).toEqual({ count: 1, hasMore: true })
    const jobs = await crawlReferralLinksQueue.searchJobs({
      name: 'crawl_referral_links_dispatcher',
    })
    const data = jobs
      .map(job => job.data as ReferralCrawlDispatchData)
      .find(data => data.cursor?.afterId === ids[0])!
    expect(data.referralLinkIds).toEqual(ids)
    expect(await dispatchReferralLinkCrawls({ ...data, computeHostnameRateLimitMs })).toEqual({
      count: 1,
      hasMore: true,
    })
    expect(
      await dispatchReferralLinkCrawls({
        ...data,
        cursor: { ...data.cursor!, afterId: ids[1]! },
        computeHostnameRateLimitMs,
      }),
    ).toEqual({ count: 1, hasMore: false })
    for (const linkId of ids)
      expect(
        await crawlReferralLinksQueue.searchJobs({ name: 'crawl_referral_link', data: { linkId } }),
      ).toHaveLength(1)
  })

  it('preserves URL event scope and bypasses cooldown on its continuation', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const urlId = await createTestUrlWithHostname()
    const users = await Promise.all([createTestUser(), createTestUser()])
    const ids = (
      await Promise.all(
        users.map(user =>
          insertTestUserReferralProgramLink({ userId: user.id, referralProgramId, urlId }),
        ),
      )
    ).toSorted()
    await Promise.all(ids.map(setReferralLinkLastCrawlSuccessAtRecent))
    // The event can run in the same millisecond as the last newly created link.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(getDateFromUUIDv7(ids[1]!)!)
    overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
      batch_size: 1,
      max_rows_per_run: 1,
    })
    const computeHostnameRateLimitMs = async () => 1
    expect(await enqueueReferralLinkCrawlsForUrlId(urlId, { computeHostnameRateLimitMs })).toEqual({
      count: 1,
      hasMore: true,
    })
    const jobs = await crawlReferralLinksQueue.searchJobs({
      name: 'crawl_referral_links_dispatcher',
      data: { urlId },
    })
    const data = jobs[0]!.data as ReferralCrawlDispatchData
    expect(data.urlId).toBe(urlId)
    expect(data.cursor?.afterId).toBe(ids[0])
    expect(await dispatchReferralLinkCrawls({ ...data, computeHostnameRateLimitMs })).toEqual({
      count: 1,
      hasMore: false,
    })
    for (const linkId of ids)
      expect(
        await crawlReferralLinksQueue.searchJobs({ name: 'crawl_referral_link', data: { linkId } }),
      ).toHaveLength(1)
  })
})
