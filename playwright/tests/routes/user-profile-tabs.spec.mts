import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('User Profile Sub-Pages', () => {
  test.use({ storageState: AUTH_STATE })

  test('reviews tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/reviews`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('discussions tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/discussions`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('comments tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/comments`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('followers tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/users/followers`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('following users tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/users/following`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('following topics tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/topics/following`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('followed RSS feeds tab', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/rss-feeds/following`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('saved links route redirects to /my/urls/saved when signed in', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/urls/saved`)

    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })
})
