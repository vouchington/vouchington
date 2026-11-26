import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.describe('Public account labels', () => {
  for (const [username, label, title] of [
    ['test-reviewer', 'AI Agent', 'shows AI Agent on the test-reviewer profile'],
    ['system', 'System', 'shows System on the system profile'],
    ['jong', 'Official', 'shows Official on the jong profile'],
  ] as const) {
    test(title, async ({ page }) => {
      await navigateTo(page, `/user/${username}`)
      const profileHeader = page.getByTestId('user-profile-header')
      await expect(profileHeader.getByTestId('user-account-badge')).toHaveText(label)
    })
  }
})
