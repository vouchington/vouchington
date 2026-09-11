import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  insertTestSystemModerationReport,
} from '@voucha/test-helpers'
import { listRedactedModerationReports } from '../redaction.mts'
import crypto from 'node:crypto'

describe('moderation-reports/redaction pagination', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  afterAll(() => releaseLock())

  it('fills public pages after excluding system-generated reports', async () => {
    const [author, systemTarget, visibleUserReporter, visiblePostReporter] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const visiblePostId = await insertTestPost({
      createdById: author!.id,
      slug: `redaction-system-page-${crypto.randomUUID().slice(0, 8)}`,
      title: `Redaction System Page ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const visibleUserReportId = await insertTestModerationReport({
      reporterUserId: visibleUserReporter!.id,
      entityType: 'user',
      entityId: systemTarget!.id,
      reason: 'spam',
      createdAt: new Date(Date.UTC(9999, 11, 30)),
    })
    const visiblePostReportId = await insertTestModerationReport({
      reporterUserId: visiblePostReporter!.id,
      entityType: 'post',
      entityId: visiblePostId,
      reason: 'spam',
      createdAt: new Date(Date.UTC(9999, 11, 29)),
    })
    const systemReportId = await insertTestSystemModerationReport(
      'user',
      systemTarget!.id,
      'Suspected ban evasion',
      new Date(Date.UTC(9999, 11, 31)),
    )

    const { reports } = await listRedactedModerationReports({
      limit: 2,
      sort: 'created_at_desc',
    })

    expect(reports).toHaveLength(2)
    expect(reports.map(report => report.id)).not.toContain(systemReportId)

    const fullPage = await listRedactedModerationReports({
      limit: 1000,
      sort: 'created_at_desc',
    })
    expect(fullPage.reports.map(report => report.id)).toEqual(
      expect.arrayContaining([visibleUserReportId, visiblePostReportId]),
    )
    expect(fullPage.reports.find(report => report.id === systemReportId)).toBeUndefined()
    expect(fullPage.reports.find(report => report.id === visibleUserReportId)?.report_count).toBe(1)

    const visibleUserReport = reports[0]!
    const followUp = await listRedactedModerationReports({
      limit: 1,
      sort: 'most_reported',
      beforeCursor: {
        id: visibleUserReport.id,
        reportCount: visibleUserReport.cursor_report_count,
      },
    })

    expect(followUp.reports.every(report => report.id !== visibleUserReport.id)).toBe(true)

    await expect(
      listRedactedModerationReports({
        limit: 1,
        sort: 'most_reported',
        beforeCursor: {
          id: systemReportId,
          reportCount: 1,
        },
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Invalid cursor' })
  })
})
