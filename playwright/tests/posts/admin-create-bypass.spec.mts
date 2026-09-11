import { expect, test } from '../../helpers/test.mts'
import { loginAsAdmin } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
async function logout(page: import('../../helpers/test.mts').Page) {
  await page.evaluate(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' })
  })
}

test.describe('Admin post creation bypass', () => {
  // These tests log out mid-test, which revokes the session server-side. Use a
  // per-test isolated login (fresh device id) instead of the shared AUTH_STATE
  // so one test's logout cannot break others sharing the captured session.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('admin can see and use the slug field on post creation', async ({ page }) => {
    await navigateTo(page, '/articles/create')

    // The admin-only slug field must be visible
    await expect(page.getByTestId('post-form-slug-input')).toBeVisible()
  })

  test('admin-created articles are publicly reachable immediately after submit', async ({
    page,
  }) => {
    await navigateTo(page, '/articles/create')

    const title = `Admin Article ${randomSuffix()}`
    await page.getByTestId('post-form-title-input').pressSequentially(title)
    await page
      .getByTestId('post-form-content-textarea')
      .pressSequentially('Admin-created article content')
    await page.getByTestId('post-form-submit').click()

    await page.waitForURL(/\/article\//)
    await expect(page.getByTestId('post-detail-heading')).toHaveText(title)

    const postUrl = page.url()
    await logout(page)
    await navigateTo(page, postUrl)

    await expect(page.getByTestId('post-detail-heading')).toHaveText(title)
  })

  test('admin-created blog posts are publicly reachable immediately after submit', async ({
    page,
  }) => {
    await navigateTo(page, '/blog/create')

    const title = `Admin Blog ${randomSuffix()}`
    await page.getByTestId('post-form-title-input').pressSequentially(title)
    await page
      .getByTestId('post-form-content-textarea')
      .pressSequentially('Admin-created blog post content')
    await page.getByTestId('post-form-submit').click()

    await page.waitForURL(/\/blog-post\//)
    await expect(page.getByTestId('post-detail-heading')).toHaveText(title)

    const postUrl = page.url()
    await logout(page)
    await navigateTo(page, postUrl)

    await expect(page.getByTestId('post-detail-heading')).toHaveText(title)
  })
})
