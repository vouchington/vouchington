import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.use({ storageState: AUTH_STATE })

test('review queue exposes its refresh control', async ({ page }) => {
  await navigateTo(page, '/posts/review-queue')
  await expect(page.getByTestId('review-queue-header-refresh-review-queue')).toBeVisible()
})
