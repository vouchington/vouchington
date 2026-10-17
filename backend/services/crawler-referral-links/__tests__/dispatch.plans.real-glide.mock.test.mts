import { afterAll, describe, expect, it, vi, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestReferralProgram,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import { insertTestReferralCrawlPlanLinks } from '@voucha/test-helpers/entities/unfurl-dispatch-plans'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getDateFromUUIDv7, mintUUIDv7 } from '@modules/utils'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import type { ReferralCrawlDispatchData } from '@queues/crawl-referral-links/types'
import { referralCrawlDispatchConfig } from '../work-limits.mts'
import { dispatchReferralLinkCrawls } from '../dispatch.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), original => original())
describe('indexed referral crawl candidates', () => {
  afterAll(() => crawlReferralLinksQueue.close())

  it('selects a bounded due page before retry filtering and advances past skipped candidates', async () => {
    const owner = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: owner.id })
    const base = (await insertTestUrlDirect(owner.id, `https://${mintUUIDv7()}.example.com/base`))!
    const urlIds = Array.from({ length: 7 }, () => mintUUIDv7())
    await insertTestCrawlDispatchPlanUrls({
      ids: urlIds,
      hostname: base.hostname.hostname,
      hostnameId: base.hostname.id,
      actorId: owner.id,
    })
    const baseCreatedAt = getDateFromUUIDv7(base.id)
    if (!baseCreatedAt) throw new Error('Expected owned native UUIDv7 anchor')
    const requestedAt = new Date(baseCreatedAt.getTime() + 86_400_000).toISOString()
    await insertTestReferralCrawlPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(0, 3),
      lastSuccessAt: requestedAt,
    })
    const skipped = await insertTestReferralCrawlPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(3, 5),
      lastSuccessAt: null,
      lastFailureAt: requestedAt,
    })
    const healthy = await insertTestReferralCrawlPlanLinks({
      userId: owner.id,
      referralProgramId,
      urlIds: urlIds.slice(5),
      lastSuccessAt: null,
    })
    const sweepStartedAt = requestedAt
    const ids = [...skipped, ...healthy].toSorted()
    const queued: string[] = []
    const dependencies = {
      computeHostnameRateLimitMs: async () => 0,
      enqueueBulkCrawlReferralLinks: async (entries: { linkId: string }[]) => {
        queued.push(...entries.map(row => row.linkId))
      },
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(referralCrawlDispatchConfig, {
        batch_size: 1,
        max_rows_per_run: 1,
      }),
    )
    const captured = await withCapturedTestQueries(() =>
      dispatchReferralLinkCrawls({
        ...dependencies,
        referralLinkIds: skipped,
        cursor: { sweepStartedAt },
      }),
    )
    expect(captured.result).toEqual({
      count: 0,
      hasMore: true,
      cursor: {
        sweepStartedAt,
        afterWork: { dueAt: '-infinity', id: skipped[0] },
      },
    })
    queued.length = 0
    let data: ReferralCrawlDispatchData = { referralLinkIds: ids, cursor: { sweepStartedAt } }
    const saveProgress = async (next: ReferralCrawlDispatchData) => {
      data = next
    }
    for (const id of ids) {
      const result = await dispatchReferralLinkCrawls({
        ...data,
        ...dependencies,
        saveProgress,
      })
      expect(result.count).toBe(skipped.includes(id) ? 0 : 1)
      expect(result.hasMore).toBe(id !== ids.at(-1))
      if (!result.hasMore) break
      expect(data.referralLinkIds).toEqual(ids)
      expect(data.cursor?.sweepStartedAt).toBe(sweepStartedAt)
    }
    expect(queued.toSorted()).toEqual(healthy)
  })
})
