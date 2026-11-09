import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { deleteTestModerationReports } from '@voucha/test-helpers/entities/moderation-report-clusters'
import { hardDeleteTestPosts } from '@voucha/test-helpers/entities/posts-deletion'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { moderationReportsWorkConfig } from '@services/moderation-reports/work-limits'

describe('clustered report summaries', () => {
  it('uses one capped sample for counts and reasons and keeps the exact boundary', async () => {
    const lock = await acquireReportPaginationTestLock()
    const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
      cluster_report_count_cap: 2,
    })
    const postIds: string[] = []
    const reportIds: string[] = []
    try {
      const [admin, owner, ...reporters] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      for (const index of [0, 1]) {
        postIds.push(
          await insertTestPost({
            createdById: owner!.id,
            slug: `capped-cluster-${index}-${crypto.randomUUID()}`,
            title: 'Capped cluster',
            markdown: 'body',
          }),
        )
      }
      const createdAt = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 996))
      for (const [index, postId] of postIds.entries()) {
        for (const [reporterIndex, reporter] of reporters.slice(0, index === 0 ? 3 : 2).entries()) {
          reportIds.push(
            await insertTestModerationReport({
              reporterUserId: reporter.id,
              entityType: 'post',
              entityId: postId,
              reason: reporterIndex === 0 ? 'harassment' : 'spam',
              createdAt,
            }),
          )
        }
      }
      const request = createRequest()
      await request.authenticateAs(admin!)
      const response = await request.get('/api/v1/reports?cluster=entity&limit=100').expect(200)
      const tool = getRegisteredToolByName('list_moderation_reports')!
      const mcp = JSON.parse(
        JSON.stringify(await tool.function(admin!)({ cluster: 'entity', limit: 100 })),
      ) as { results: typeof response.body.results }
      const summaries = (
        results: Array<{
          entity_id: string
          report_count: number
          report_count_capped: boolean
          summary_capped: boolean
          reporter_count: number
          reason_breakdown: Array<{ count: number }>
        }>,
      ) =>
        results
          .filter(item => postIds.includes(item.entity_id))
          .map(item => ({
            entity_id: item.entity_id,
            report_count: item.report_count,
            report_count_capped: item.report_count_capped,
            summary_capped: item.summary_capped,
            reporter_count: item.reporter_count,
            reason_counts: item.reason_breakdown.map(reason => reason.count),
          }))
      expect(summaries(mcp.results)).toEqual(summaries(response.body.results))
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
      try {
        try {
          await deleteTestModerationReports(reportIds)
        } finally {
          await hardDeleteTestPosts(postIds)
        }
      } finally {
        await lock.release()
      }
    }
  })
})
