import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import { moderationReportsWorkConfig } from '@services/moderation-reports/work-limits'

describe('clustered report summaries', () => {
  it('uses one capped sample for counts and reasons and keeps the exact boundary', async () => {
    const lock = await acquireReportPaginationTestLock()
    const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
      cluster_report_count_cap: 2,
    })
    try {
      const [admin, owner, ...reporters] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const postIds = await Promise.all(
        [0, 1].map(index =>
          insertTestPost({
            createdById: owner!.id,
            slug: `capped-cluster-${index}-${crypto.randomUUID()}`,
            title: 'Capped cluster',
            markdown: 'body',
          }),
        ),
      )
      const createdAt = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 996))
      await Promise.all(
        postIds.flatMap((postId, index) =>
          reporters.slice(0, index === 0 ? 3 : 2).map((reporter, reporterIndex) =>
            insertTestModerationReport({
              reporterUserId: reporter.id,
              entityType: 'post',
              entityId: postId,
              reason: reporterIndex === 0 ? 'harassment' : 'spam',
              createdAt,
            }),
          ),
        ),
      )
      const request = createRequest()
      await request.authenticateAs(admin!)
      const response = await request.get('/api/v1/reports?cluster=entity&limit=1000').expect(200)
      const capped = response.body.results.find(
        (item: { entity_id: string }) => item.entity_id === postIds[0],
      )
      const exact = response.body.results.find(
        (item: { entity_id: string }) => item.entity_id === postIds[1],
      )
      expect(capped).toMatchObject({
        report_count: 2,
        report_count_capped: true,
        summary_capped: true,
        reporter_count: 2,
      })
      expect(exact).toMatchObject({
        report_count: 2,
        report_count_capped: false,
        summary_capped: false,
        reporter_count: 2,
      })
      const sample = capped.reports.slice(0, 2) as Array<{ reason: string }>
      const expected = sample.reduce<Record<string, number>>((counts, report) => {
        counts[report.reason] = (counts[report.reason] ?? 0) + 1
        return counts
      }, {})
      expect(
        Object.fromEntries(
          capped.reason_breakdown.map((entry: { reason: string; count: number }) => [
            entry.reason,
            entry.count,
          ]),
        ),
      ).toEqual(expected)
      expect(exact.reason_breakdown).toEqual(
        expect.arrayContaining([
          { reason: 'harassment', count: 1 },
          { reason: 'spam', count: 1 },
        ]),
      )
      expect(capped.reports).toHaveLength(3)
      expect(
        capped.reports.every(
          (report: { report_count: number; report_count_capped: boolean }) =>
            report.report_count === 2 && report.report_count_capped,
        ),
      ).toBe(true)
    } finally {
      restore()
      await lock.release()
    }
  })
})
