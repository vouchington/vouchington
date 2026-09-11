import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Icon button tooltips', () => {
  test.use({ storageState: AUTH_STATE })

  test('inbox button shows tooltip on hover', async ({ page }) => {
    await navigateTo(page, '/news')

    const inboxButton = page.getByTestId('inbox-open-button')
    await expect(inboxButton).toBeVisible()

    await inboxButton.hover()

    await expect(page.getByRole('tooltip', { name: 'Inbox' })).toBeVisible()
  })

  test('aside toggle button shows tooltip on hover', async ({ page }) => {
    await navigateTo(page, '/news')

    const asideToggle = page.getByTestId('aside-toggle-button')
    await expect(asideToggle).toBeVisible()

    await asideToggle.hover()

    await expect(page.getByRole('tooltip', { name: /Toggle sidebar/ })).toBeVisible()
  })
})
