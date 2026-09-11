import { test, expect } from '../helpers/test.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { AUTH_STATE } from '../helpers/auth-state.mts'

test.describe('/my/notifications page', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders notification list with follow notification', async ({ page }) => {
    await navigateTo(page, '/my/notifications')

    // The seeded test user has a follow notification from test-friend (entity_type='follow')
    await expect(page.getByTestId('notification-item-follow')).toBeVisible()
  })
})
