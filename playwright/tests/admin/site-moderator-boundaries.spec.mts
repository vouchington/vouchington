/**
 * Admin-vs-moderator role boundary tests.
 *
 * Administrator: full staff access, can bulk-remove reports, can suspend users,
 *   can view /admin/modlog.
 * Moderator: can view /reports and /appeals with staff UI, CANNOT bulk remove
 *   reports (button present but disabled), CANNOT access /admin/modlog
 *   (redirected to /), CANNOT access /user/:id/admin (404).
 *
 * NOTE: /admin/modlog uses requireAdmin() on the frontend. The backend
 * /api/v1/admin/modlog route is also guarded by isAdminUser, so both layers
 * are consistent — moderators are blocked at both boundaries.
 */

import { test, expect } from '../../helpers/test.mts'
import { createSiteModeratorUser, loginAsUser } from '../../helpers/auth.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  reviewPendingTestModerationReportsByPostSlugPrefixes,
  reviewPendingTestModerationReportsByReporterUsernamePrefixes,
} from '../../../backend/test-helpers/index.mts'

// Run tests serially: with fullyParallel: true, Playwright can split this
// file's tests across multiple workers, each running beforeAll. A worker's
// cleanup sweep would then mark a concurrent worker's freshly-seeded report as
// reviewed before that worker reaches the bulk-action specs.
test.describe.configure({ mode: 'serial' })

const flatReportsUrl = '/reports?cluster=none&sort=created_at_desc'
const clusterReportsUrl = '/reports?sort=created_at_desc'

let moderatorId = ''
let targetUserId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  // Clean up pending reports from all prior runs that used these stable prefixes.
  // Suffix-scoped prefixes would only match the current run and never clean up
  // orphaned rows from previous runs — so we use the bare prefix here.
  await Promise.all([
    reviewPendingTestModerationReportsByPostSlugPrefixes(['smod-post-']),
    reviewPendingTestModerationReportsByReporterUsernamePrefixes(['smod-reporter-']),
  ])

  const moderator = await createSiteModeratorUser()
  moderatorId = moderator.id

  const reporter = await createTestUser({ username: `smod-reporter-${suffix}` })
  if (!reporter) throw new Error('Failed to create reporter')

  const target = await createTestUser({ username: `smod-target-${suffix}` })
  if (!target) throw new Error('Failed to create target user')
  targetUserId = target.id

  const postId = await insertTestPost({
    title: `Site mod boundary post ${suffix}`,
    slug: `smod-post-${suffix}`,
    createdById: target.id,
    markdown: 'Content for site moderator boundary test.',
  })

  await insertTestModerationReport({
    reporterUserId: reporter.id,
    entityType: 'post',
    entityId: postId,
    reason: 'spam',
  })
})

test.describe('site moderator — /reports access', () => {
  test('moderator sees the staff reports page heading', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, clusterReportsUrl)

    await expect(page.getByTestId('reports-heading')).toBeVisible()
  })

  test('moderator sees the clustered reports list with staff UI', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, clusterReportsUrl)

    await expect(page.getByTestId('reports-cluster-list')).toBeVisible()
  })

  test('moderator sees the flat reports list with staff sort options', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, flatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()
    // Staff-only sort option is visible for moderators
    await expect(page.getByTestId('reports-sort-trigger')).toBeVisible()
  })
})

test.describe('site moderator — bulk-remove restriction', () => {
  test('moderator: Remove button is disabled, Dismiss is enabled after selecting a row', async ({
    page,
  }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, flatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    // Select the first report row to trigger the bulk toolbar
    const firstCheckbox = page.getByTestId('report-row-checkbox').first()
    await expect(firstCheckbox).toBeVisible()
    await firstCheckbox.click()

    // Toolbar should now render (selectedCount > 0)
    await expect(page.getByTestId('moderation-selected-count')).toBeVisible()

    // Dismiss is available to moderators
    await expect(page.getByTestId('bulk-dismiss-button')).toBeEnabled()

    // Remove is disabled for moderators (admin-only action)
    const removeButton = page.getByTestId('bulk-remove-button')
    await expect(removeButton).toBeDisabled()
    await expect(removeButton).toHaveAttribute(
      'title',
      'Only administrators can bulk remove reported content.',
    )
  })
})

test.describe('site moderator — /appeals access', () => {
  test('moderator sees the appeals page heading', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, '/appeals')

    await expect(page.getByTestId('appeals-heading')).toBeVisible()
  })
})

test.describe('site moderator — /admin/modlog access denied', () => {
  test('moderator is redirected away from /admin/modlog (admin-only)', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, '/admin/modlog')

    // requireAdmin() redirects non-admins off /admin/modlog — assert we are
    // no longer on the modlog and that the modlog heading is gone, rather
    // than coupling to the home page's authenticated redirect target.
    await expect(page).not.toHaveURL(/\/admin\/modlog/)
    await expect(page.getByTestId('admin-modlog-heading')).toBeHidden()
  })
})

test.describe('site moderator — /user/:id/admin access denied', () => {
  test('moderator cannot access user admin panel (returns 404)', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, `/user/${targetUserId}/admin`)

    // notFound() renders the 404 status page — assert the positive condition first
    await expect(page.getByTestId('status-page-title')).toBeVisible()
    await expect(page.getByTestId('user-administration-title')).toBeHidden()
  })
})

test.describe('admin positive controls', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin sees the staff reports page heading', async ({ page }) => {
    await navigateTo(page, clusterReportsUrl)

    await expect(page.getByTestId('reports-heading')).toBeVisible()
  })

  test('admin: Remove button is enabled after selecting a row', async ({ page }) => {
    await navigateTo(page, flatReportsUrl)

    await expect(page.getByTestId('reports-list')).toBeVisible()

    const firstCheckbox = page.getByTestId('report-row-checkbox').first()
    await expect(firstCheckbox).toBeVisible()
    await firstCheckbox.click()

    await expect(page.getByTestId('moderation-selected-count')).toBeVisible()
    await expect(page.getByTestId('bulk-remove-button')).toBeEnabled()
    await expect(page.getByTestId('bulk-dismiss-button')).toBeEnabled()
  })

  test('admin sees the appeals page heading', async ({ page }) => {
    await navigateTo(page, '/appeals')

    await expect(page.getByTestId('appeals-heading')).toBeVisible()
  })

  test('admin can access /admin/modlog', async ({ page }) => {
    await navigateTo(page, '/admin/modlog')

    await expect(page.getByTestId('admin-modlog-heading')).toBeVisible()
  })

  test('admin can access user admin panel', async ({ page }) => {
    await navigateTo(page, `/user/${targetUserId}/admin`)

    await expect(page.getByTestId('user-administration-title')).toBeVisible()
  })
})
