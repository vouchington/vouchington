import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

async function logout(page: import('../../helpers/test.mts').Page) {
  await page.evaluate(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' })
  })
}

async function approvePostClearance(page: import('../../helpers/test.mts').Page, idOrSlug: string) {
  const ok = await page.evaluate(async (slug: string) => {
    const res = await fetch(`/api/v1/posts/${slug}/clearances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
      credentials: 'same-origin',
    })
    return res.ok
  }, idOrSlug)
  expect(ok).toBe(true)
}

test.describe('Post Broadcast & Privacy', () => {
  // These tests log out mid-test, which revokes the session server-side. Use a
  // per-test isolated login (fresh device id) instead of the shared AUTH_STATE
  // so one test's logout cannot break others sharing the captured session.
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
  })

  test('post form shows audience controls and reveals visibility for restricted audiences', async ({
    page,
  }) => {
    await navigateTo(page, '/discussions/create')
    await waitForBelowFoldHydration(page)

    // Expand Advanced collapsible to reveal Audience and Anonymous controls
    await page.getByTestId('post-form-advanced-toggle').click()

    await expect(page.getByTestId('post-form-audience-label')).toBeVisible()
    await expect(page.getByTestId('post-form-anonymous-checkbox')).toBeVisible()
    await expect(page.getByTestId('post-form-visibility-label')).toHaveCount(0)

    await page.getByTestId('post-form-audience-trigger').press(' ')
    await page.getByTestId('post-form-audience-users').click()
    await expect(page.getByTestId('post-form-visibility-label')).toBeVisible()
  })

  test('followers-private posts are noindexed and hidden from logged-out users', async ({
    page,
  }) => {
    await navigateTo(page, '/discussions/create')
    await waitForBelowFoldHydration(page)

    // Fill title and content
    const titleInput = page.getByTestId('post-form-title-input')
    await titleInput.pressSequentially(`Broadcast Test ${randomSuffix()}`)

    const contentInput = page.getByTestId('post-form-content-textarea')
    await contentInput.pressSequentially('Test broadcast privacy settings')

    // Expand Advanced collapsible to reveal Audience controls
    await page.getByTestId('post-form-advanced-toggle').click()

    // Change audience to Followers
    await page.getByTestId('post-form-audience-trigger').press(' ')
    await page.getByTestId('post-form-audience-followers').click()

    // Visibility select should now appear
    await expect(page.getByTestId('post-form-visibility-label')).toBeVisible()

    // Change to Private
    await page.getByTestId('post-form-visibility-trigger').press(' ')
    await page.getByTestId('post-form-visibility-private').click()

    // Submit (use type=submit to distinguish from nav buttons)
    await page.locator('button[type="submit"]').click()

    // Verify redirect to detail page and badges appear
    await page.waitForURL(/\/discussion\//)

    await approvePostClearance(page, page.url().split('/').pop()!)

    await expect(page.getByTestId('post-detail-broadcast-badge')).toContainText('Followers')
    await expect(page.getByTestId('post-detail-badge-private')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)

    const postUrl = page.url()
    await logout(page)
    await navigateTo(page, postUrl)

    await expect(page.getByTestId('status-page-title')).toContainText('Page not found')
  })

  test('anonymous posts hide authors after logout', async ({ page }) => {
    await navigateTo(page, '/discussions/create')
    await waitForBelowFoldHydration(page)

    await page
      .getByTestId('post-form-title-input')
      .pressSequentially(`Anonymous Test ${randomSuffix()}`)
    await page.getByTestId('post-form-content-textarea').pressSequentially('Anonymous post content')
    // Expand Advanced collapsible to reveal anonymous checkbox
    await page.getByTestId('post-form-advanced-toggle').click()
    await page.getByTestId('post-form-anonymous-checkbox').click()
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/discussion\//)

    await approvePostClearance(page, page.url().split('/').pop()!)

    await expect(page.getByTestId('post-detail-byline')).toContainText('Posted by tests')

    const postUrl = page.url()
    await logout(page)
    await navigateTo(page, postUrl)

    await expect(page.getByTestId('post-detail-byline')).toContainText('Posted by Anonymous')
  })

  test('users-public posts are noindexed but remain visible by URL after logout', async ({
    page,
  }) => {
    await navigateTo(page, '/discussions/create')
    await waitForBelowFoldHydration(page)

    const title = `Users Public ${randomSuffix()}`
    await page.getByTestId('post-form-title-input').pressSequentially(title)
    await page.getByTestId('post-form-content-textarea').pressSequentially('Users public content')
    // Expand Advanced collapsible to reveal Audience controls
    await page.getByTestId('post-form-advanced-toggle').click()
    await page.getByTestId('post-form-audience-trigger').press(' ')
    await page.getByTestId('post-form-audience-users').click()
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/discussion\//)

    await approvePostClearance(page, page.url().split('/').pop()!)

    await expect(page.getByTestId('post-detail-broadcast-badge')).toContainText('Signed In')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)

    const postUrl = page.url()
    await logout(page)
    await navigateTo(page, postUrl)

    await expect(page.locator('body')).toContainText(title)
  })

  test('users-private posts are noindexed and hidden from logged-out users', async ({ page }) => {
    await navigateTo(page, '/discussions/create')
    await waitForBelowFoldHydration(page)

    await page
      .getByTestId('post-form-title-input')
      .pressSequentially(`Users Private ${randomSuffix()}`)
    await page.getByTestId('post-form-content-textarea').pressSequentially('Users private content')
    // Expand Advanced collapsible to reveal Audience controls
    await page.getByTestId('post-form-advanced-toggle').click()
    await page.getByTestId('post-form-audience-trigger').press(' ')
    await page.getByTestId('post-form-audience-users').click()

    await page.getByTestId('post-form-visibility-trigger').press(' ')
    await page.getByTestId('post-form-visibility-private').click()
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/discussion\//)

    await approvePostClearance(page, page.url().split('/').pop()!)

    await expect(page.getByTestId('post-detail-broadcast-badge')).toContainText('Signed In')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)

    const postUrl = page.url()
    await logout(page)
    await navigateTo(page, postUrl)

    await expect(page.getByTestId('status-page-title')).toContainText('Page not found')
  })
})
