import { afterAll, describe, expect, it, vi } from 'vitest'
import { getDateFromUUIDv7 } from '@modules/utils'
import {
  createTestUser,
  insertTestReferralProgram,
  createTestUrlWithHostname,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import {
  createTestUserReferralProgramLinkIdAt,
  setReferralLinkLastCrawlSuccessAtRecent,
} from '@voucha/test-helpers/entities/referral-links'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withOwnedReferralDispatchAdmissions } from '@voucha/test-helpers/referral-dispatch-admissions'
import { backgroundCpu as crawlReferralLinksQueue } from '@queues/background-cpu/queues'
import { enqueueBulkCrawlReferralLinks } from '@queues/crawl-referral-links/enqueues'
import type { ReferralCrawlDispatchData } from '@queues/crawl-referral-links/types'
import { referralCrawlDispatchConfig } from './work-limits.mts'
import { dispatchReferralLinkCrawls, enqueueReferralLinkCrawlsForUrlId } from './dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('bounded referral crawl dispatch', () => {
  afterAll(() => crawlReferralLinksQueue.close())

  it('rejects an invalid event clock before saving dispatch progress', async () => {
    const saveProgress = vi.fn<() => Promise<void>>(async () => {})
    await expect(
      dispatchReferralLinkCrawls({ now: new Date(Number.NaN), saveProgress }),
    ).rejects.toThrow(TypeError)
    expect(saveProgress).not.toHaveBeenCalled()
  })

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
    await withOwnedReferralDispatchAdmissions({ linkIds: ids }, async admissions => {
      overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      })
      const computeHostnameRateLimitMs = async () => 1
      const progress: ReferralCrawlDispatchData[] = []
      expect(
        await dispatchReferralLinkCrawls({
          referralLinkIds: ids,
          computeHostnameRateLimitMs,
          saveProgress: async next => {
            progress.push(next)
          },
        }),
      ).toMatchObject({ count: 1, hasMore: true })
      const data = progress.at(-1)!
      expect(data.cursor?.afterWork?.id).toBe(ids[0])
      expect(data.referralLinkIds).toEqual(ids)
      expect(
        await dispatchReferralLinkCrawls({ ...data, computeHostnameRateLimitMs }),
      ).toMatchObject({ count: 1, hasMore: true })
      expect(
        await dispatchReferralLinkCrawls({
          ...data,
          cursor: { ...data.cursor!, afterWork: { dueAt: '-infinity', id: ids[1]! } },
          computeHostnameRateLimitMs,
        }),
      ).toEqual({ count: 1, hasMore: false })
      for (const linkId of ids) expect(await admissions.crawlJobs(linkId)).toHaveLength(1)
    })
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
    await withOwnedReferralDispatchAdmissions({ linkIds: ids, urlId }, async admissions => {
      // The event can run in the same millisecond as the last newly created link.
      const eventNow = getDateFromUUIDv7(ids[1]!)!
      overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      })
      const computeHostnameRateLimitMs = async () => 1
      expect(
        await enqueueReferralLinkCrawlsForUrlId(urlId, {
          computeHostnameRateLimitMs,
          now: eventNow,
        }),
      ).toEqual({ count: 1, hasMore: true })
      const jobs = await admissions.dispatcherJobs(urlId)
      expect(jobs).toHaveLength(1)
      const data = jobs[0]!.data as ReferralCrawlDispatchData
      expect(data.urlId).toBe(urlId)
      expect(data.cursor?.sweepStartedAt).toBe(eventNow.toISOString())
      expect(data.cursor?.afterId).toBe(ids[0])
      expect(
        await dispatchReferralLinkCrawls({ ...data, computeHostnameRateLimitMs, now: new Date(0) }),
      ).toMatchObject({ count: 1, hasMore: false })
      for (const linkId of ids) expect(await admissions.crawlJobs(linkId)).toHaveLength(1)
    })
  })

  it.each([
    { label: 'January to February 2025', cutoff: '2025-02-01T00:00:00.000Z' },
    { label: 'January to February 2026', cutoff: '2026-02-01T00:00:00.000Z' },
    { label: 'leap February to March 2020', cutoff: '2020-03-01T00:00:00.000Z' },
    { label: 'leap February to March 2024', cutoff: '2024-03-01T00:00:00.000Z' },
    { label: 'December to January 2024', cutoff: '2024-01-01T00:00:00.000Z' },
    { label: 'December to January 2026', cutoff: '2026-01-01T00:00:00.000Z' },
  ])('includes owned URL links through the $label event instant', async ({ cutoff }) => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const urlId = await createTestUrlWithHostname()
    const users = [owner, ...(await Promise.all([createTestUser(), createTestUser()]))]
    const cutoffMs = Date.parse(cutoff)
    const idMillis = [cutoffMs - 2, cutoffMs, cutoffMs + 1]
    const ids = await Promise.all(
      users.map((user, index) =>
        insertTestUserReferralProgramLink({
          id: createTestUserReferralProgramLinkIdAt(new Date(idMillis[index]!)),
          userId: user.id,
          referralProgramId,
          urlId,
        }),
      ),
    )
    expect(ids.map(id => getDateFromUUIDv7(id)?.getTime())).toEqual(idMillis)
    overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
      batch_size: 3,
      max_rows_per_run: 3,
    })
    const computeHostnameRateLimitMs = async () => 1
    const enqueuedIds: string[][] = []
    const enqueueAndRecord: typeof enqueueBulkCrawlReferralLinks = (entries, options) => {
      enqueuedIds.push(entries.map(entry => entry.linkId))
      return enqueueBulkCrawlReferralLinks(entries, options)
    }
    for (const [nowMs, count] of [
      [cutoffMs - 1, 1],
      [cutoffMs, 2],
      [cutoffMs + 1, 3],
    ] as const) {
      expect(
        await enqueueReferralLinkCrawlsForUrlId(urlId, {
          computeHostnameRateLimitMs,
          enqueueBulkCrawlReferralLinks: enqueueAndRecord,
          now: new Date(nowMs),
        }),
      ).toEqual({ count, hasMore: false })
      expect(enqueuedIds.at(-1)?.toSorted()).toEqual(ids.slice(0, count).toSorted())
    }
    expect(enqueuedIds).toHaveLength(3)
  })
})
