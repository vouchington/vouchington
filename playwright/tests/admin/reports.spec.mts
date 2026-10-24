import { expect, test, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { randomBytes } from 'node:crypto'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestReportJudgement,
  reviewPendingTestModerationReportsByPostSlugPrefixes,
  reviewPendingTestModerationReportsByReporterUsernamePrefixes,
  setPostModerationContentSha256,
  setPostSpamDetectionResults,
  reviewTestModerationReports,
} from '../../../backend/test-helpers/index.mts'
import { loginAsAdmin, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo, openRadixDropdown, randomSuffix } from 'vouchington-tooling/playwright'

let reportId = ''
let reporterUserId = ''
let postTitle = ''
let postId = ''
const seededReportsUrl = '/reports?sort=created_at_desc'
const seededFlatReportsUrl = '/reports?cluster=none&sort=created_at_desc&limit=100'

test.beforeAll(async () => {
  protectPlaywrightHookTimeouts(test.info())
  await Promise.all([
    reviewPendingTestModerationReportsByReporterUsernamePrefixes(['rpt-reporter-', 'rpt-extra-']),
    reviewPendingTestModerationReportsByPostSlugPrefixes([
      'rpt-post-',
      'report-route-count-',
      'report-route-count-other-',
    ]),
  ])

  const suffix = randomSuffix()

  const reporter = await createTestUser({ username: `rpt-reporter-${suffix}` })
  if (!reporter) throw new Error('Failed to create reporter user')
  reporterUserId = reporter.id

  const target = await createTestUser({ username: `rpt-target-${suffix}` })
  if (!target) throw new Error('Failed to create target user')

  postTitle = `Reported post ${suffix}`
  postId = await insertTestPost({
    title: postTitle,
    slug: `rpt-post-${suffix}`,
    createdById: target.id,
    markdown: 'This post will be reported.',
  })

  reportId = await insertTestModerationReport({
    reporterUserId: reporter.id,
    entityType: 'post',
    entityId: postId,
    reason: 'spam',
    createdAt: new Date(Date.UTC(2802, 0, 2)),
  })

  await insertTestReportJudgement({
    entityType: 'post',
    entityId: postId,
    triggeringReportId: reportId,
    recommendedAction: 'remove',
    publicResponse: 'This content was removed for violating our spam policy.',
    internalResponse: 'Spam pattern detected.',
  })

  const extraReportIds = await Promise.all(
    Array.from({ length: 2 }, async (_, index) => {
      const extraReporter = await createTestUser({
        username: `rpt-extra-${suffix}-${index}`,
      })
      if (!extraReporter) throw new Error('Failed to create extra reporter user')
      return insertTestModerationReport({
        reporterUserId: extraReporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(2802, 0, 1)),
      })
    }),
  )
  void extraReportIds
})

test.describe('Admin moderation reports', () => {
  test.describe.configure({ mode: 'serial' })

  test.describe('duplicate-post cluster controls', () => {
    const duplicateReportIds: string[] = []

    test.beforeAll(async () => {
      protectPlaywrightHookTimeouts(test.info())
      const suffix = randomSuffix()
      const hash = randomBytes(32)
      const owner = await createTestUser({ username: `rpt-dup-owner-${suffix}` })
      const reporter = await createTestUser({ username: `rpt-dup-reporter-${suffix}` })
      if (!owner || !reporter) throw new Error('Failed to create duplicate-cluster users')
      const ids = await Promise.all(
        Array.from({ length: 3 }, async (_, index) => {
          const duplicatePostId = await insertTestPost({
            title: `Duplicate cluster ${suffix} ${index}`,
            slug: `rpt-dup-${suffix}-${index}`,
            createdById: owner.id,
            markdown: 'Duplicate-cluster fixture body.',
          })
          await setPostModerationContentSha256(duplicatePostId, hash)
          await setPostSpamDetectionResults(duplicatePostId, [
            { signal: 'content_hash_duplicate', score: 1, flagged: true },
          ])
          return insertTestModerationReport({
            reporterUserId: reporter.id,
            entityType: 'post',
            entityId: duplicatePostId,
            reason: 'spam',
            createdAt: new Date(Date.UTC(2803, 0, 2)),
          })
        }),
      )
      duplicateReportIds.push(...ids)
    })

    test.afterAll(async () => {
      protectPlaywrightHookTimeouts(test.info())
      if (duplicateReportIds.length > 0) await reviewTestModerationReports(duplicateReportIds)
    })

    test('shows removal confirmation for a seeded duplicate-post cluster', async ({ page }) => {
      await loginAsAdmin(page)
      await navigateTo(page, seededReportsUrl)
      const remove = page.getByTestId('report-duplicate-cluster-card-remove-all').first()
      await expect(remove).toBeVisible()
      await remove.click()
      await expect(page.getByTestId('report-duplicate-cluster-card-remove-posts')).toBeVisible()
    })
  })

  test('admin sees pending reports page heading', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededReportsUrl)

    await expect(page.getByTestId('reports-heading')).toBeVisible()
  })

  test('admin sees the seeded report cluster with spam reason', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededReportsUrl)

    await expect(page.getByTestId('reports-cluster-list')).toBeVisible()

    const reportCluster = page.getByTestId('report-cluster-row').filter({ hasText: postTitle })
    await expect(reportCluster).toBeVisible()
    await expect(reportCluster).toContainText('spam 3')
    await expect(reportCluster.getByTestId('report-cluster-card-toggle')).toBeVisible()
    await expect(reportCluster.getByTestId('report-cluster-actions-review-loaded')).toBeVisible()
    await expect(reportCluster.getByTestId('report-cluster-actions-dismiss-loaded')).toBeVisible()
    await expect(reportCluster.getByTestId('report-cluster-actions-remove-target')).toBeVisible()
    await expect(
      reportCluster.getByTestId('report-cluster-detail-re-run-judgement').first(),
    ).toBeVisible()
  })

  test('admin can see flat report sort controls and badges', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededFlatReportsUrl)

    const reportRow = page.getByTestId('report-row').filter({ hasText: postTitle }).first()
    await expect(reportRow).toBeVisible()
    await expect(reportRow.getByTestId('admin-report-row-reviewed')).toBeVisible()
    await expect(reportRow.getByTestId('admin-report-row-dismiss')).toBeVisible()
    await expect(reportRow.getByTestId('admin-report-row-rerun-ai-judgement')).toBeVisible()
    await expect(reportRow.getByTestId('admin-reports-reason')).toHaveText('spam')
    await expect(reportRow.getByTestId('moderation-sla-badge')).toBeVisible()
    await expect(reportRow.getByTestId('moderation-report-count-badge')).toBeVisible()

    const sortTrigger = page.getByTestId('reports-sort-trigger')
    await expect(sortTrigger).toBeVisible()
    await openRadixDropdown(sortTrigger)
    await expect(page.getByTestId('reports-sort-option-most-reported')).toBeAttached()
  })

  test('admin can use moderation report keyboard shortcuts', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededReportsUrl)

    await expect(page.getByTestId('reports-cluster-list')).toBeVisible()

    const reportCluster = page.getByTestId('report-cluster-row').filter({ hasText: postTitle })
    await expect(reportCluster).toBeVisible()

    await page.keyboard.press('?')
    await expect(page.getByTestId('keyboard-shortcuts-title')).toHaveText('Moderation Shortcuts')
  })

  test('signed-in non-staff user sees reports list (redacted, no reporter identity)', async ({
    page,
  }) => {
    await loginAsUser(page, reporterUserId)
    await navigateTo(page, '/reports')

    // Non-staff users see the reports list with redacted rows
    await expect(page.getByTestId('reports-list')).toBeVisible()
    // Rows use the member-report-row marker (not admin report-row)
    const memberRows = page.getByTestId('member-report-row')
    await expect(memberRows.first()).toBeVisible()
    await expect(memberRows.first().getByTestId('report-reason')).toBeVisible()
  })

  test('admin sees judgement chip on a report that has been judged and can open detail popover', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededReportsUrl)

    await expect(page.getByTestId('reports-cluster-list')).toBeVisible()

    const reportCluster = page.getByTestId('report-cluster-row').filter({ hasText: postTitle })
    await expect(reportCluster).toBeVisible()

    await expect(reportCluster.getByText('remove', { exact: true }).first()).toBeVisible()
    await expect(
      reportCluster.getByTestId('report-judgement-public-response').first(),
    ).toBeVisible()
    await expect(
      reportCluster.getByTestId('report-judgement-internal-response').first(),
    ).toBeVisible()
  })

  test('admin sees re-run judgement button on all staff report rows', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, seededReportsUrl)

    await expect(page.getByTestId('reports-cluster-list')).toBeVisible()

    const reportCluster = page.getByTestId('report-cluster-row').filter({ hasText: postTitle })
    await expect(reportCluster).toBeVisible()
    await expect(
      reportCluster.getByRole('button', { name: /re-run judgement/i }).first(),
    ).toBeVisible()
  })

  test('signed-out user is redirected to login from reports page', async ({ page }) => {
    await navigateTo(page, '/reports')
    await expect(page).toHaveURL(/\/login/)
  })
})
