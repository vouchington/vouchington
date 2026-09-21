import { expect, test } from '../../helpers/test.mts'
import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Copyright notice authentication', () => {
  test('anonymous visitors are redirected before a notice form is rendered', async ({ page }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright/notices/new')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('copyright-notice-form')).toHaveCount(0)
  })
})
