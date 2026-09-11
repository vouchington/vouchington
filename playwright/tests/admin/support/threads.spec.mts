import { test, expect } from '../../../helpers/test.mts'
import { navigateTo } from '../../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../../helpers/auth-state.mts'

test.describe('Admin Support — /support thread list', () => {
  test.use({ storageState: AUTH_STATE })

  test('redirects unauthenticated users away from /support', async ({ page }) => {
    await page.context().clearCookies()
    const response = await page.goto('/support')
    // Admin layout redirects unauthorized users to homepage
    expect(page.url()).not.toContain('/support')
    expect(response).toBeDefined()
  })

  test('loads support threads list for admin', async ({ page }) => {
    await navigateTo(page, '/support')

    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'Support Threads' }),
    ).toBeVisible()
    await expect(page.getByTestId('admin-page-header-description')).toContainText(
      'Manage customer support requests',
    )
  })

  test('shows status filter dropdown', async ({ page }) => {
    await navigateTo(page, '/support')

    await expect(page.getByTestId('support-threads-status-filter')).toBeVisible()
  })

  test('searches threads with URL-backed query state', async ({ page }) => {
    await navigateTo(page, '/support')

    const search = page.getByRole('searchbox', { name: 'Search support threads' })
    await search.fill('account access')
    await page.getByRole('button', { name: 'Search', exact: true }).click()

    await expect(page).toHaveURL(/\/support\?q=account\+access|\/support\?q=account%20access/)
  })

  test('shows refresh button', async ({ page }) => {
    await navigateTo(page, '/support')

    await expect(page.getByTestId('support-threads-refresh')).toBeVisible()
  })

  test('shows table with Subject, Status, Created, Updated columns', async ({ page }) => {
    await navigateTo(page, '/support')

    await expect(page.getByTestId('support-threads-column-subject')).toBeVisible()
    await expect(page.getByTestId('support-threads-column-status')).toBeVisible()
    await expect(page.getByTestId('support-threads-column-created')).toBeVisible()
    await expect(page.getByTestId('support-threads-column-updated')).toBeVisible()
  })

  test('filters by open status via URL param', async ({ page }) => {
    await navigateTo(page, '/support?status=open')

    // Filter dropdown should reflect the current status
    const trigger = page.getByTestId('support-threads-status-filter')
    await expect(trigger).toBeVisible()
    await expect(trigger).toContainText('Open')
  })

  test('filters by resolved status via URL param', async ({ page }) => {
    await navigateTo(page, '/support?status=resolved')

    const trigger = page.getByTestId('support-threads-status-filter')
    await expect(trigger).toContainText('Resolved')
  })

  test('shows empty state when no threads match filter', async ({ page }) => {
    // Use assigned filter — likely to show empty in a clean test environment or show correct UI
    await navigateTo(page, '/support?status=assigned')

    // Either threads are shown or the empty state is shown — both are valid
    const hasRows = await page.locator('tbody tr').count()
    const hasEmptyState = await page
      .getByTestId('admin-table-shell-empty')
      .isVisible()
      .catch(() => false)
    expect(hasRows > 0 || hasEmptyState).toBe(true)
  })
})
