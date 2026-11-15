import { describe, expect, it } from 'vitest'
import {
  createModerationSummaryCollection,
  createModerationSummaryScan,
  MODERATION_SUMMARY_ZERO_ID,
} from '@queues/background/enqueues/moderation-summary-state'
import { collectModerationSummaryPage } from './moderation-summary-collection.mts'
import { collectRankReportPostPage } from './moderation-summary-rank-reports.mts'

describe('moderator digest continuation boundaries', () => {
  it('finishes an exhausted discussion selection without adding a community', async () => {
    const collection = createModerationSummaryCollection()
    collection.upperMembershipId = MODERATION_SUMMARY_ZERO_ID
    collection.phase = 'discussions'
    const end = new Date('2026-01-20T12:00:00Z')
    const result = await collectModerationSummaryPage(
      crypto.randomUUID(),
      new Date('2026-01-19T12:00:00Z'),
      end,
      end,
      collection,
      [],
      { membershipPageSize: 1, sourcePageSize: 1 },
    )
    expect(result.collection.phase).toBe('ready')
    expect(result.communities).toEqual([])
    expect(collection.phase).toBe('discussions')
  })

  it.each([0, -1, 1.5, 101])('rejects unsafe source page size %s before advancing', async size => {
    const collection = createModerationSummaryCollection()
    collection.upperMembershipId = MODERATION_SUMMARY_ZERO_ID
    const before = structuredClone(collection)
    const end = new Date('2026-01-20T12:00:00Z')
    await expect(
      collectModerationSummaryPage(crypto.randomUUID(), end, end, end, collection, [], {
        membershipPageSize: 1,
        sourcePageSize: size,
      }),
    ).rejects.toThrow(RangeError)
    expect(collection).toEqual(before)
  })

  it('advances saturated report counters without restarting their completed source scan', async () => {
    const scan = createModerationSummaryScan(crypto.randomUUID(), 'report-posts')
    scan.afterId = crypto.randomUUID()
    scan.sourceUpperId = crypto.randomUUID()
    scan.metrics.pending_reports = 100
    scan.metrics.escalated_items = 100
    await collectRankReportPostPage(scan, 1)
    expect(scan).toMatchObject({
      stage: 'evaders',
      afterId: MODERATION_SUMMARY_ZERO_ID,
      sourceUpperId: null,
      metrics: { pending_reports: 100, escalated_items: 100 },
    })
  })
})
