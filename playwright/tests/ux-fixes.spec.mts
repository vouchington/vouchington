import { test, expect } from '../helpers/test.mts'
import { AUTH_STATE } from '../helpers/auth-state.mts'
import { navigateTo } from '../helpers/navigate-to.mts'

/**
 * QA fixes for UX polish and accessibility improvements.
 * Tests cover:
 * - Plans page: table row labels, all plan cards visible
 * - Feed routes: /feed/news/friends, dropdown navigation
 * - Empty states: communities with icon
 * - Create pages: /articles/create, /blog/create hydrated forms for admins
 */

test.describe('Plans Page — Table Accessibility', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/plans')
  })

  test('comparison table row labels have proper semantics', async ({ page }) => {
    const table = page.locator('table').first()
    await expect(table).toBeVisible()

    // Verify the table has tbody with rows
    const tbody = table.locator('tbody')
    await expect(tbody).toBeVisible()

    const rows = tbody.locator('tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(5) // Should have 5+ feature rows

    // Verify every row has a th[scope="row"] label cell
    const headerCells = tbody.locator('tr th[scope="row"]')
    await expect(headerCells).toHaveCount(rowCount)
  })

  test('comparison table has columns for all three plans', async ({ page }) => {
    await expect(page.getByTestId('plan-comparison-column-free')).toBeVisible()
    await expect(page.getByTestId('plan-comparison-column-plus')).toBeVisible()
    await expect(page.getByTestId('plan-comparison-column-pro')).toBeVisible()
  })

  test('comparison table features are readable with proper structure', async ({ page }) => {
    const table = page.locator('table')
    const rows = table.locator('tbody tr')
    const rowCount = await rows.count()

    // Verify there are multiple rows
    expect(rowCount).toBeGreaterThan(5)

    // Verify first few rows have cells for all three plans
    const firstRow = rows.nth(0)
    const firstRowCells = firstRow.locator('td')
    const firstRowCellCount = await firstRowCells.count()
    expect(firstRowCellCount).toBeGreaterThanOrEqual(3)

    const secondRow = rows.nth(1)
    const secondRowCells = secondRow.locator('td')
    const secondRowCellCount = await secondRowCells.count()
    expect(secondRowCellCount).toBeGreaterThanOrEqual(3)
  })
})

test.describe('Feed Routes — Navigation and Sub-routes', () => {
  test.use({ storageState: AUTH_STATE })

  test('/feed/posts renders dropdown navigation', async ({ page }) => {
    await navigateTo(page, '/feed/posts')

    await expect(
      page.getByTestId('page-content-wrapper').getByTestId('feed-page-heading'),
    ).toContainText('My Posts Feed')

    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')
  })

  test('/feed/news renders dropdown navigation', async ({ page }) => {
    await navigateTo(page, '/feed/news')

    await expect(
      page.getByTestId('page-content-wrapper').getByTestId('feed-page-heading'),
    ).toContainText('My News Feed')

    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')
  })

  test('/feed/news/friends renders friends filter', async ({ page }) => {
    await navigateTo(page, '/feed/news/friends')

    await expect(
      page.getByTestId('page-content-wrapper').getByTestId('feed-page-heading'),
    ).toContainText('My News Feed')

    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Friends')
  })

  test('feed dropdown controls do not create horizontal scrolling on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/feed/posts')

    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toBeVisible()
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })
})

test.describe('Empty States — Communities', () => {
  test.use({ storageState: AUTH_STATE })

  test('/communities shows empty state text when no communities found', async ({ page }) => {
    await navigateTo(page, '/communities?q=nonexistent-xyz-12345')

    // Check for title and description text from EmptyState component
    await expect(page.getByTestId('empty-state-title')).toContainText(/No communities found/i)
    await expect(page.getByTestId('empty-state-description')).toContainText(/Check back later/i)
  })

  test('communities page header is always visible', async ({ page }) => {
    await navigateTo(page, '/communities')

    const heading = page.getByTestId('communities-page-heading')
    await expect(heading).toContainText('Communities')
    await expect(heading).toBeVisible()
  })
})

test.describe('Create Pages — Articles and Blog', () => {
  test.use({ storageState: AUTH_STATE })

  test('/articles/create renders article creation form for admin users', async ({ page }) => {
    await navigateTo(page, '/articles/create')

    await expect(page).toHaveURL('/articles/create')
    await expect(page.getByTestId('post-form')).toBeVisible()
  })

  test('/blog/create renders blog creation form for admin users', async ({ page }) => {
    await navigateTo(page, '/blog/create')

    await expect(page).toHaveURL('/blog/create')
    await expect(page.getByTestId('post-form')).toBeVisible()
  })
})

test.describe('OAuth Button — Facebook', () => {
  test('Facebook login button is hidden until runtime public config enables it', async ({
    page,
  }) => {
    await navigateTo(page, '/login')

    await expect(page.getByTestId('oauth-provider-button-facebook')).toBeHidden()
  })
})
