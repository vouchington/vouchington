import { expect, test } from '../helpers/test.mts'
import { navigateTo } from '../helpers/navigate-to.mts'

test('shows the public CRM unsubscribe action without authentication', async ({ page }) => {
  await navigateTo(page, '/crm/unsubscribe?token=invalid')

  await expect(page).toHaveURL('/crm/unsubscribe?token=invalid')
  await expect(page.getByTestId('public-crm-unsubscribe-button')).toBeVisible()
})
