import { expect, test } from '../helpers/test.mts'
import { navigateTo } from '../helpers/navigate-to.mts'

test('shows the public email unsubscribe action without authentication', async ({ page }) => {
  await navigateTo(page, '/email/unsubscribe?token=invalid')

  await expect(page).toHaveURL('/email/unsubscribe?token=invalid')
  await expect(page.getByTestId('public-email-unsubscribe-button')).toBeVisible()
})
