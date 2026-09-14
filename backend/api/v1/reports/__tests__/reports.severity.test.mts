import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestUsersDirect,
  insertTestModerationReport,
  insertTestModerationReportsForTarget,
  insertTestPost,
  insertTestReportJudgement,
  reviewPendingTestModerationReportsByPostSlugPrefixes as reviewReportsByPostSlugPrefixes,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/reports severity sort', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  let user: PrivateUser
  let adminUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    adminUser = await createTestUser({ administrator: true })
  })
  afterAll(() => releaseLock())

  it('returns report_count and supports most_reported sorting for admin requests', async () => {
    await reviewReportsByPostSlugPrefixes(['report-route-count-'])
    const targetPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-route-count-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Route Count ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const otherPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-route-count-other-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Route Count Other ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reporters = await createTestUsersDirect(121)
    await Promise.all([
      insertTestModerationReportsForTarget({
        reporterUserIds: reporters.slice(0, 120).map(reporter => reporter.id),
        entityType: 'post',
        entityId: targetPostId,
        createdAt: new Date(Date.UTC(2502, 0, 1)),
      }),
      insertTestModerationReport({
        reporterUserId: reporters[120].id,
        entityType: 'post',
        entityId: otherPostId,
        createdAt: new Date(Date.UTC(2502, 0, 1)),
      }),
    ])
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/reports?sort=most_reported&limit=100').expect(200)
    const targetReports = (response.body.results as Array<Record<string, unknown>>).filter(
      report => report.entity_id === targetPostId,
    )
    expect(targetReports.length).toBeGreaterThan(0)
    expect(targetReports.every(report => report.report_count === 120)).toBe(true)
    expect(targetReports[0]).not.toHaveProperty('cursor_report_count')
    expect(targetReports[0]).not.toHaveProperty('cursor_severity_rank')
  })

  it('supports severity sorting for admin requests', async () => {
    const warnPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-route-severity-warn-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Route Severity Warn ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const escalatePostId = await insertTestPost({
      createdById: user.id,
      slug: `report-route-severity-escalate-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Route Severity Escalate ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const [warnReporter, escalateReporter] = await Promise.all([createTestUser(), createTestUser()])
    await insertTestModerationReport({
      reporterUserId: warnReporter!.id,
      entityType: 'post',
      entityId: warnPostId,
    })
    const escalateReportId = await insertTestModerationReport({
      reporterUserId: escalateReporter!.id,
      entityType: 'post',
      entityId: escalatePostId,
    })
    const removeReporters = await createTestUsersDirect(24)
    await insertTestModerationReportsForTarget({
      reporterUserIds: removeReporters.map(reporter => reporter.id),
      entityType: 'post',
      entityId: warnPostId,
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: warnPostId,
      recommendedAction: 'remove',
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: escalatePostId,
      recommendedAction: 'escalate',
    })
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/reports?sort=severity&limit=1000').expect(200)
    const reports = response.body.results as Array<{ id: string }>
    expect(reports.findIndex(report => report.id === escalateReportId)).toBeGreaterThanOrEqual(0)
  })
})
