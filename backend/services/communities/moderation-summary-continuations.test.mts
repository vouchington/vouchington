import { describe, expect, it } from 'vitest'
import {
  createModerationSummaryCollection,
  createModerationSummaryScan,
  MODERATION_SUMMARY_ZERO_ID,
} from '@queues/background/enqueues/moderation-summary-state'
import { runModerationSummaryMemberships } from './moderation-summary-collection.mts'
import { walkModerationSummaryPages } from './moderation-summary-pages.mts'
import { collectRankReportPostPage } from './moderation-summary-rank-reports.mts'
import { runModerationSummaryStage } from './moderation-summary-stages.mts'

const end = new Date('2026-01-20T12:00:00Z')

describe('moderator digest continuation boundaries', () => {
  it('sends an exhausted membership walk that ranked nothing without adding a community', async () => {
    const collection = {
      ...createModerationSummaryCollection(),
      upperMembershipId: MODERATION_SUMMARY_ZERO_ID,
    }
    const result = await runModerationSummaryMemberships({
      userId: crypto.randomUUID(),
      windowStart: new Date('2026-01-19T12:00:00Z'),
      windowEnd: end,
      eligibilityAt: end,
      collection,
      communities: [],
      limits: { membershipPageSize: 1, sourcePageSize: 1 },
    })
    expect(result).toMatchObject({ next: 'send', communities: [] })
    expect(result.collection.scan).toBeNull()
    expect(collection.activityWindowEnd).toBeNull()
  })

  it.each([0, -1, 1.5, 101])('rejects unsafe source page size %s before advancing', async size => {
    const collection = {
      ...createModerationSummaryCollection(),
      upperMembershipId: MODERATION_SUMMARY_ZERO_ID,
      scan: createModerationSummaryScan(crypto.randomUUID()),
    }
    await expect(
      runModerationSummaryStage('reviews', {
        userId: crypto.randomUUID(),
        windowStart: end,
        windowEnd: end,
        eligibilityAt: end,
        collection,
        communities: [],
        limits: { membershipPageSize: 1, sourcePageSize: size },
      }),
    ).rejects.toThrow(RangeError)
  })

  it('advances saturated report counters without restarting their completed source scan', async () => {
    const scan = {
      ...createModerationSummaryScan(crypto.randomUUID()),
      afterId: crypto.randomUUID(),
      sourceUpperId: crypto.randomUUID(),
      metrics: {
        ...createModerationSummaryScan(crypto.randomUUID()).metrics,
        pending_reports: 100,
        escalated_items: 100,
      },
    }
    const step = await collectRankReportPostPage(scan, 1)
    expect(step).toMatchObject({
      next: 'evaders',
      state: {
        afterId: MODERATION_SUMMARY_ZERO_ID,
        sourceUpperId: null,
        metrics: { pending_reports: 100, escalated_items: 100 },
      },
    })
  })

  it('reads up to the page cap, and stops early when the stage finishes', async () => {
    const pages: number[] = []
    const capped = await walkModerationSummaryPages(0, 3, async n => {
      pages.push(n)
      return { state: n + 1, next: null }
    })
    expect(capped).toEqual({ state: 3, next: null })
    expect(pages).toEqual([0, 1, 2])
    const finished = await walkModerationSummaryPages(0, 3, async n => ({
      state: n + 1,
      next: n === 1 ? 'send' : null,
    }))
    expect(finished).toEqual({ state: 2, next: 'send' })
  })
})
