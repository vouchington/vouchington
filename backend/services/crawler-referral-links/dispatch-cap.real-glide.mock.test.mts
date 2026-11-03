import { afterAll, describe, expect, it, vi } from 'vitest'
import { getUrlById } from '@services/urls/get'
import { getDateFromUUIDv7 } from '@modules/utils'
import {
  createTestUser,
  insertTestReferralProgram,
  createTestUrlWithHostname as insertTestUrlWithHostname,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import {
  createTestUserReferralProgramLinkIdAt,
  setReferralLinkLastCrawlSuccessAtRecent,
} from '@voucha/test-helpers/entities/referral-links'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  deleteTestRobotsTxtCache,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers/entities/dispatch'
import { withOwnedReferralDispatchAdmissions } from '@voucha/test-helpers/referral-dispatch-admissions'
import { backgroundCpu as crawlReferralLinksQueue } from '@queues/background-cpu/queues'
import type { ReferralCrawlDispatchData } from '@queues/crawl-referral-links/types'
import { referralCrawlDispatchConfig } from './work-limits.mts'
import { dispatchReferralLinkCrawls, enqueueReferralLinkCrawlsForUrlId } from './dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

const seededHostnames: string[] = []

/** Rate-limit calculation reads the cached robots.txt, so seeded hosts never touch the network. */
async function createTestUrlWithHostname() {
  const urlId = await insertTestUrlWithHostname()
  const url = await getUrlById(urlId)
  if (!url) throw new Error('Expected owned URL')
  seededHostnames.push(url.hostname.hostname)
  await setTestRobotsTxtCache(url.hostname.hostname, 'User-agent: *\nAllow: /')
  return urlId
}

describe('bounded referral crawl dispatch', () => {
  afterAll(async () => {
    await deleteTestRobotsTxtCache(...seededHostnames)
    await crawlReferralLinksQueue.close()
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
      const progress: ReferralCrawlDispatchData[] = []
      expect(
        await dispatchReferralLinkCrawls({
          referralLinkIds: ids,
          saveProgress: async next => {
            progress.push(next)
          },
        }),
      ).toMatchObject({ count: 1, hasMore: true })
      const data = progress.at(-1)!
      expect(data.cursor?.afterWork?.id).toBe(ids[0])
      expect(data.referralLinkIds).toEqual(ids)
      expect(await dispatchReferralLinkCrawls(data)).toMatchObject({ count: 1, hasMore: true })
      expect(
        await dispatchReferralLinkCrawls({
          ...data,
          cursor: { ...data.cursor!, afterWork: { dueAt: '-infinity', id: ids[1]! } },
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
      overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      })
      // Freeze only the Date around the call so the sweep instant is knowable; the links above
      // were created under the real clock.
      const eventNow = new Date()
      vi.useFakeTimers({ toFake: ['Date'], now: eventNow })
      const enqueued = await enqueueReferralLinkCrawlsForUrlId(urlId).finally(() =>
        vi.useRealTimers(),
      )
      expect(enqueued).toEqual({ count: 1, hasMore: true })
      const jobs = await admissions.dispatcherJobs(urlId)
      expect(jobs).toHaveLength(1)
      const data = jobs[0]!.data as ReferralCrawlDispatchData
      expect(data.urlId).toBe(urlId)
      expect(data.cursor?.sweepStartedAt).toBe(eventNow.toISOString())
      expect(data.cursor?.afterId).toBe(ids[0])
      expect(await dispatchReferralLinkCrawls(data)).toMatchObject({
        count: 1,
        hasMore: false,
      })
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
    for (const [nowMs, count] of [
      [cutoffMs - 1, 1],
      [cutoffMs, 2],
      [cutoffMs + 1, 3],
    ] as const) {
      await withOwnedReferralDispatchAdmissions({ linkIds: ids, urlId }, async admissions => {
        expect(
          await dispatchReferralLinkCrawls({
            urlId,
            cursor: { sweepStartedAt: new Date(nowMs).toISOString() },
          }),
        ).toEqual({ count, hasMore: false })
        for (const [index, linkId] of ids.entries())
          expect(await admissions.crawlJobs(linkId)).toHaveLength(index < count ? 1 : 0)
      })
    }
  })

  it('keeps an explicit page when shared referral crawl config is larger', async () => {
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
    const restore = overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
      batch_size: 1000,
      max_rows_per_run: 20000,
    })
    try {
      await withOwnedReferralDispatchAdmissions({ linkIds: ids }, async () => {
        await expect(
          dispatchReferralLinkCrawls({
            referralLinkIds: ids,
            limits: { batchSize: 1, maxRows: 1 },
          }),
        ).resolves.toMatchObject({ count: 1, hasMore: true })
      })
    } finally {
      restore()
    }
  })
})
