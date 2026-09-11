import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }

async function ensureSidebarOpen(page: Parameters<typeof navigateTo>[0]) {
  const sidebarPeer = page.getByTestId('sidebar-peer')
  if ((await sidebarPeer.getAttribute('data-state')) !== 'expanded') {
    await page.getByTestId('sidebar-trigger').click()
  }
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  await expect(sidebar).toBeVisible()
  return sidebar
}

test.describe('Sidebar Navigation', () => {
  // These tests exercise the signed-out sidebar (generic nav links). Keep the
  // config-default anonymous storageState — do NOT use AUTH_STATE here, as the
  // authenticated sidebar renders different items per intent.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('should navigate to reviews page', async ({ page }) => {
    await navigateTo(page, '/discussions')
    const sidebar = await ensureSidebarOpen(page)

    await sidebar.getByTestId('sidebar-nav-reviews').click()
    await expect(page).toHaveURL(/.*reviews/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Reviews')
  })

  test('should navigate to discussions page', async ({ page }) => {
    await navigateTo(page, '/reviews')
    const sidebar = await ensureSidebarOpen(page)
    await sidebar.getByTestId('sidebar-nav-discussions').click()
    await expect(page).toHaveURL(/.*discussions/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discussions')
  })

  test('should navigate to communities page', async ({ page }) => {
    await navigateTo(page, '/communities')
    const sidebar = await ensureSidebarOpen(page)
    const exploreLink = sidebar.getByTestId('sidebar-nav-explore')
    await expect(exploreLink).toBeVisible()
    await expect(exploreLink).toHaveAttribute('href', '/communities')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Communities')
  })

  test('should navigate to sources page', async ({ page }) => {
    await navigateTo(page, '/web-search')
    const sidebar = await ensureSidebarOpen(page)
    await sidebar.getByTestId('sidebar-nav-sources').click()
    await expect(page).toHaveURL(/.*sources/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sources')
  })

  test('should navigate to referral programs page', async ({ page }) => {
    await navigateTo(page, '/referral-programs')
    const sidebar = await ensureSidebarOpen(page)
    const referralLink = sidebar.getByTestId('sidebar-nav-referral-programs')
    await expect(referralLink).toBeVisible()
    await expect(referralLink).toHaveAttribute('href', '/referral-programs')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Referral Programs')
  })

  test('Data Points link is clickable after navigating to Discussions', async ({ page }) => {
    await navigateTo(page, '/discussions')
    const sidebar = await ensureSidebarOpen(page)

    await sidebar.getByTestId('sidebar-nav-data-points').click()
    await expect(page).toHaveURL(/\/data-points$/)

    await sidebar.getByTestId('sidebar-nav-discussions').click()
    await expect(page).toHaveURL(/\/discussions$/)

    await sidebar.getByTestId('sidebar-nav-data-points').click()
    await expect(page).toHaveURL(/\/data-points$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Data Points')
  })

  test('should highlight active nav item', async ({ page }) => {
    await navigateTo(page, '/reviews')
    await ensureSidebarOpen(page)
    const activeLink = page.locator('[data-active="true"]').filter({ hasText: 'Reviews' })
    await expect(activeLink).toBeVisible()
  })
})

test.describe('Sidebar section order', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    // Navigate to a real page so authenticated tests can call ensureSidebarOpen immediately.
    // storageState starts at about:blank; unauthenticated tests override with clearCookies+nav.
    await navigateTo(page, '/')
  })

  test('unauthenticated: news intent shows Browse group with All News and All News Sources', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')
    const sidebar = await ensureSidebarOpen(page)

    await expect(sidebar.getByTestId('sidebar-nav-all-news')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-all-news-sources')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-your-news')).toBeHidden()
  })

  test('unauthenticated: Referral Programs link is visible in referral-links intent', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/referral-programs')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-referral-programs')).toBeVisible()
  })

  test('unauthenticated: no Settings section in sidebar', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')
    const sidebar = await ensureSidebarOpen(page)
    const labels = await sidebar.locator('[data-sidebar="group-label"]').allTextContents()
    expect(labels).not.toContain('Settings')
  })

  test('unauthenticated: no Create section in sidebar', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')
    const sidebar = await ensureSidebarOpen(page)
    const labels = await sidebar.locator('[data-sidebar="group-label"]').allTextContents()
    expect(labels).not.toContain('Create')
  })

  test('authenticated: news intent shows Your News and All News on /', async ({ page }) => {
    const sidebar = await ensureSidebarOpen(page)

    await expect(sidebar.getByTestId('sidebar-nav-your-news')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-all-news')).toBeVisible()
  })

  test('authenticated: posts intent shows Your Posts on /posts', async ({ page }) => {
    await navigateTo(page, '/posts')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-your-posts')).toBeVisible()
  })

  test('unauthenticated: Your News not visible in news intent sidebar', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-your-news')).toBeHidden()
  })

  test('All News link has same href for signed-out and signed-in users', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')
    const sidebar = await ensureSidebarOpen(page)
    const unauthNewsLink = sidebar.getByTestId('sidebar-nav-all-news')
    await expect(unauthNewsLink).toHaveAttribute('href', '/news')
    const unauthHref = requireTestValue(
      await unauthNewsLink.getAttribute('href'),
      'Expected signed-out All News link href',
    )

    await loginAsTestUser(page)
    // Navigate to re-render the page with auth state — loginAsTestUser injects cookies
    // but doesn't reload, so the sidebar still shows anonymous content.
    await navigateTo(page, '/')
    const authSidebar = await ensureSidebarOpen(page)
    const authNewsLink = authSidebar.getByTestId('sidebar-nav-all-news')

    await expect(authNewsLink).toHaveAttribute('href', unauthHref)
    await expect(authNewsLink).toHaveAttribute('href', '/news')
  })

  test('authenticated: Landing Pages link visible in landing-pages intent', async ({ page }) => {
    await navigateTo(page, '/my/landing-pages')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-my-landing-pages')).toBeVisible()
  })

  test('authenticated: My Referrals link visible in referral-links intent', async ({ page }) => {
    await navigateTo(page, '/my/referrals')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-my-referrals')).toBeVisible()
  })

  test('authenticated: My Referral Link Feed visible in referral-links intent', async ({
    page,
  }) => {
    await navigateTo(page, '/feed/referral-links')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-my-referral-link-feed')).toBeVisible()
  })

  test('unauthenticated: My Referral Link Feed not visible in referral-links intent', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/referral-programs')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-nav-my-referral-link-feed')).toBeHidden()
  })

  test('authenticated: no Settings section in sidebar', async ({ page }) => {
    const sidebar = await ensureSidebarOpen(page)
    const labels = await sidebar.locator('[data-sidebar="group-label"]').allTextContents()
    expect(labels).not.toContain('Settings')
  })

  test('authenticated: no Create section in sidebar', async ({ page }) => {
    const sidebar = await ensureSidebarOpen(page)
    const labels = await sidebar.locator('[data-sidebar="group-label"]').allTextContents()
    expect(labels).not.toContain('Create')
  })

  test('admin: intent switcher includes Growth, Moderation, CRM, and Engineering', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/')

    // Open the intent switcher in the navbar (there are two triggers; scope to nav)
    const navbar = page.locator('nav[aria-label="Main"]')
    await navbar.getByTestId('intent-switcher-trigger').click()

    await expect(page.getByTestId('intent-switcher-item-growth')).toBeVisible()
    await expect(page.getByTestId('intent-switcher-item-moderation')).toBeVisible()
    await expect(page.getByTestId('intent-switcher-item-crm')).toBeVisible()
    await expect(page.getByTestId('intent-switcher-item-engineering')).toBeVisible()
  })
})

test.describe('Sidebar accordion', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('Browse section label is visible on news intent', async ({ page }) => {
    await navigateTo(page, '/')
    const sidebar = await ensureSidebarOpen(page)

    await expect(sidebar.getByTestId('sidebar-nav-all-news-sources')).toBeVisible()

    await expect(
      sidebar.locator('[data-sidebar="group-label"]').filter({ hasText: 'Browse' }),
    ).toBeVisible()
  })
})
