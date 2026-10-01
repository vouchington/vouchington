import { expect, test } from '../../helpers/test.mts'
import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Copyright notice authentication', () => {
  test('anonymous visitors can open the notice form', async ({ page }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright/notices/new')

    await expect(page).toHaveURL(/\/copyright\/notices\/new$/)
    await expect(page.getByTestId('copyright-notice-form')).toBeVisible()
    await expect(page.getByTestId('copyright-designated-agent-hint')).toBeVisible()
  })

  test('anonymous visitors are redirected before the case list is rendered', async ({ page }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright/notices')

    await expect(page).toHaveURL(/\/login$/)
  })
})
