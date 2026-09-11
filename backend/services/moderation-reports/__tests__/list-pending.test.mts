import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestModerationReportsForTarget,
  insertTestPost,
  insertTestReportJudgement,
  reviewPendingTestModerationReportsByPostSlugPrefixes,
  reviewTestModerationReports,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'
import { listModerationReports, listPendingModerationReports } from '../get.mts'

describe('listPendingModerationReports', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  let otherUser: PrivateUser

  beforeAll(async () => {
    otherUser = await createTestUser()
  })
  afterAll(() => releaseLock())

  it('returns pending reports in descending created_at order', async () => {
    await reviewPendingTestModerationReportsByPostSlugPrefixes(['list-test-post-'])
    const postId1 = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-test-post-1-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Test Post 1 ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test body',
    })
    const postId2 = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-test-post-2-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Test Post 2 ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test body',
    })

    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()

    const createdAt = new Date(Date.UTC(2900, 0, 1))
    const report1Id = await insertTestModerationReport({
      reporterUserId: reporter1.id,
      entityType: 'post',
      entityId: postId1,
      reason: 'spam',
      createdAt,
    })
    const report2Id = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'post',
      entityId: postId2,
      reason: 'harassment',
      createdAt,
    })

    const { reports } = await listPendingModerationReports({ limit: 1000 })
    const ids = reports.map(r => r.id)
    expect(ids).toEqual(expect.arrayContaining([report1Id, report2Id]))
    // Results must contain both; verify descending order by checking adjacent timestamps
    const ourReports = reports.filter(r => r.entity_id === postId1 || r.entity_id === postId2)
    expect(ourReports.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < ourReports.length; i++) {
      expect(ourReports[i - 1]!.created_at.getTime()).toBeGreaterThanOrEqual(
        ourReports[i]!.created_at.getTime(),
      )
    }
  })

  it('respects the limit and sets hasNextPage', async () => {
    // Create enough fresh reports to guarantee hasNextPage
    const freshOwner = await createTestUser()
    for (let i = 0; i < 3; i++) {
      const pid = await insertTestPost({
        createdById: freshOwner.id,
        slug: `list-limit-post-${i}-${crypto.randomUUID().slice(0, 8)}`,
        title: `List Limit Post ${i} ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      // Use a distinct reporter per post to avoid duplicate-pending conflict
      const distinctReporter = await createTestUser()
      await createModerationReport(
        distinctReporter.id,
        parseCreateModerationReportInput({
          entityType: 'post',
          entityId: pid,
          reason: 'spam',
          note: null,
        }),
      )
    }

    const { reports: smallPage, hasNextPage } = await listPendingModerationReports({ limit: 1 })
    expect(smallPage.length).toBe(1)
    expect(hasNextPage).toBe(true)
  })

  it('supports compound cursor pagination', async () => {
    const freshOwner = await createTestUser()
    const pid = await insertTestPost({
      createdById: freshOwner.id,
      slug: `list-cursor-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Cursor Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const cursorReporter = await createTestUser()
    const { report } = await createModerationReport(
      cursorReporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: pid,
        reason: 'other',
        note: null,
      }),
    )

    // Fetch with the exact report cursor — the cursor row should not appear again.
    const { reports } = await listPendingModerationReports({
      limit: 100,
      beforeCursor: {
        id: report.id,
      },
    })
    expect(reports.find(r => r.id === report.id)).toBeUndefined()
  })

  it('adds a per-entity report count', async () => {
    const postId = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-count-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Count Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const [reporter1, reporter2] = await Promise.all([createTestUser(), createTestUser()])
    const [reportId] = await Promise.all([
      insertTestModerationReport({
        reporterUserId: reporter1!.id,
        entityType: 'post',
        entityId: postId,
        createdAt: new Date(Date.UTC(2601, 0, 1)),
      }),
      insertTestModerationReport({
        reporterUserId: reporter2!.id,
        entityType: 'post',
        entityId: postId,
      }),
    ])

    const { reports } = await listModerationReports({ limit: 5000, sort: 'created_at_desc' })
    const report = reports.find(r => r.id === reportId)

    expect(report?.report_count).toBe(2)
  })

  it('sorts by most reported with oldest report as the tie-breaker', async () => {
    const heavilyReportedPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-most-reported-heavy-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Most Reported Heavy ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const lightlyReportedPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-most-reported-light-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Most Reported Light ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reporters = await Promise.all(Array.from({ length: 49 }, () => createTestUser()))
    const heavyReportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.slice(0, 25).map(reporter => reporter!.id),
      entityType: 'post',
      entityId: heavilyReportedPostId,
      createdAt: new Date(Date.UTC(2501, 0, 1)),
    })
    const lightReportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.slice(25).map(reporter => reporter!.id),
      entityType: 'post',
      entityId: lightlyReportedPostId,
      createdAt: new Date(Date.UTC(2501, 0, 1)),
    })

    const { reports } = await listModerationReports({ limit: 5000, sort: 'most_reported' })
    const ids: string[] = []

    for (const report of reports) {
      if (
        report.entity_id === heavilyReportedPostId ||
        report.entity_id === lightlyReportedPostId
      ) {
        ids.push(report.id)
      }
    }

    expect(ids.indexOf(heavyReportIds[0]!)).toBeLessThan(ids.indexOf(lightReportIds[0]!))
    expect(ids.indexOf(heavyReportIds[1]!)).toBeLessThan(ids.indexOf(lightReportIds[0]!))
  })

  it('rejects stale most-reported cursors when the cursor target report count changes', async () => {
    const postId = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-stale-most-reported-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Stale Most Reported ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const [reporter1, reporter2] = await Promise.all([createTestUser(), createTestUser()])
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: [reporter1!.id, reporter2!.id],
      entityType: 'post',
      entityId: postId,
      createdAt: new Date(Date.UTC(2401, 0, 1)),
    })

    const { reports } = await listModerationReports({ limit: 5000, sort: 'most_reported' })
    const cursorReport = reports.find(report => report.id === reportIds[0])
    expect(cursorReport).toBeDefined()
    await reviewTestModerationReports([reportIds[1]!])

    await expect(
      listModerationReports({
        limit: 10,
        sort: 'most_reported',
        beforeCursor: {
          id: cursorReport!.id,
          reportCount: cursorReport!.cursor_report_count,
        },
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Invalid cursor' })
  })

  it('sorts by judgement severity before report count and age', async () => {
    await reviewPendingTestModerationReportsByPostSlugPrefixes([
      'list-severity-warn-',
      'list-severity-remove-',
    ])
    const warnPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-severity-warn-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Severity Warn ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const removePostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `list-severity-remove-${crypto.randomUUID().slice(0, 8)}`,
      title: `List Severity Remove ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const [warnReporter, removeReporter] = await Promise.all([createTestUser(), createTestUser()])
    const warnReportId = await insertTestModerationReport({
      reporterUserId: warnReporter!.id,
      entityType: 'post',
      entityId: warnPostId,
    })
    const removeReportId = await insertTestModerationReport({
      reporterUserId: removeReporter!.id,
      entityType: 'post',
      entityId: removePostId,
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: warnPostId,
      triggeringReportId: warnReportId,
      recommendedAction: 'warn',
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: removePostId,
      triggeringReportId: removeReportId,
      recommendedAction: 'remove',
    })

    const { reports } = await listModerationReports({ limit: 5000, sort: 'severity' })
    const ids = reports.map(r => r.id)

    expect(ids.indexOf(removeReportId)).toBeLessThan(ids.indexOf(warnReportId))
  })
})
