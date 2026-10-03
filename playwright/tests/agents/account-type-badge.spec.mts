import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Public account labels', () => {
  for (const [username, label] of [
    ['test-reviewer', 'AI Agent'],
    ['system', 'System'],
    ['jong', 'Official'],
  ] as const) {
    test(`shows ${label} on the ${username} profile`, async ({ page }) => {
      await navigateTo(page, `/user/${username}`)
      const profileHeader = page.getByTestId('user-profile-header')
      await expect(profileHeader.getByTestId('user-account-badge')).toHaveText(label)
    })
  }
})
