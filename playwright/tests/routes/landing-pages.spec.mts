import { expect, test } from '../../helpers/test.mts'
import { loginAsTestUser, loginAsUser, TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

test.describe('Landing pages', () => {
  test('renders the default public landing page', async ({ page }) => {
    const response = await page.goto(`/@${TEST_USER_USERNAME}`)
    expect(response?.status()).toBe(200)

    await expect(page.getByTestId('landing-page-title')).toContainText('Test landing page')
    await expect(page.getByTestId('landing-page-profile-link')).toContainText('Test profile link')
    await expect(page.getByTestId('landing-page-topic-group-name')).toContainText(
      'Chase Sapphire Referral Picks',
    )

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(canonical).toContain(`/@${TEST_USER_USERNAME}`)
  })

  test('renders the slug landing page', async ({ page }) => {
    const response = await page.goto(`/@${TEST_USER_USERNAME}/bonus`)
    expect(response?.status()).toBe(200)

    await expect(page.getByTestId('landing-page-title')).toContainText('Bonus page')
    await expect(page.getByTestId('landing-page-referral-link')).toContainText(
      'Apply with my referral',
    )
  })

  test('public landing page has no site chrome (linktree layout)', async ({ page }) => {
    await navigateTo(page, `/@${TEST_USER_USERNAME}`)

    // No sidebar, navbar, tabs, breadcrumbs, or asides
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: /profile/i })).toHaveCount(0)
    await expect(page.locator('[aria-label="Breadcrumb"]')).toHaveCount(0)
    // No profile tab bar (About/Activity/Posts)
    await expect(page.getByRole('tab', { name: /About|Activity|Posts/i })).toHaveCount(0)
    // The linktree header and Voucha footer CTA should be present
    await expect(page.getByTestId('landing-page-title')).toBeVisible()
    await expect(page.getByTestId('landing-page-voucha-cta')).toBeVisible()
    await expect(page.getByTestId('landing-page-voucha-cta')).toHaveAttribute('href', '/login')
  })

  test('shows empty state when user has no landing pages', async ({ page }) => {
    // createTestUser uses a direct SQL update for username and does NOT call
    // ensureDefaultLandingPage, so this user has a username but no pages.
    const user = requireTestValue(await createTestUser(), 'Failed to create test user')

    await loginAsUser(page, user.id)
    await navigateTo(page, '/my/landing-pages')

    await expect(page.getByTestId('landing-pages-empty-state')).toBeVisible()
    await expect(page.getByTestId('landing-pages-create-button')).toBeVisible()
  })

  test('shows landing pages in settings index', async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, '/my/landing-pages')

    await expect(page.getByTestId('landing-pages-settings-heading')).toBeVisible()
    await expect(page.getByTestId('landing-pages-settings-page-title').first()).toContainText(
      'Test landing page',
    )
    await expect(page.getByTestId('landing-pages-settings-page-button-bonus')).toBeVisible()
    await expect(page.getByTestId('landing-pages-view-live-link').first()).toBeVisible()
  })

  test('editor page shows back link and preview link', async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, '/my/landing-page/bonus')

    await expect(page.getByTestId('landing-page-editor')).toBeVisible()
    await expect(page.getByTestId('landing-page-editor-back')).toBeVisible()
    await expect(page.getByTestId('landing-page-editor-preview')).toBeVisible()
    const previewHref = await page.getByTestId('landing-page-editor-preview').getAttribute('href')
    expect(previewHref).toContain(`/@${TEST_USER_USERNAME}/bonus`)
  })

  test('og:image meta tag points to dynamic OG image route', async ({ page }) => {
    await navigateTo(page, `/@${TEST_USER_USERNAME}`)

    const ogImage = page.locator('meta[property="og:image"]')
    await expect(ogImage).toHaveAttribute('content', /\/og\/[A-Za-z0-9_-]+\?sig=/)
  })

  test('no horizontal overflow on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await navigateTo(page, `/@${TEST_USER_USERNAME}`)

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasHorizontalScroll).toBe(false)

    const landingPageLinks = page.locator('a[data-item-id]')
    await expect(landingPageLinks).not.toHaveCount(0)
    const links = await landingPageLinks.all()
    const boxes = await Promise.all(links.map(link => link.boundingBox()))
    const linkBoxes = boxes.map(box =>
      requireTestValue(box, 'Landing-page CTA must have a layout box'),
    )
    for (const box of linkBoxes) expect(box.height).toBeGreaterThanOrEqual(44)
  })
})
