import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('BookmarkPageHeader', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders heading on a singleton bookmark page', async ({ page }) => {
    await navigateTo(page, '/my/users/followers')

    await expect(page.getByTestId('bookmark-page-heading')).toBeVisible()
    await expect(page.getByTestId('bookmark-page-heading')).toContainText('My Followers')
  })

  test('renders cross-intent title dropdown on a family bookmark page', async ({ page }) => {
    await navigateTo(page, '/my/news-items/saved')

    await expect(page.getByTestId('bookmark-page-heading')).toBeVisible()
    await expect(page.getByTestId('bookmark-title-dropdown-trigger')).toBeVisible()
  })
})
