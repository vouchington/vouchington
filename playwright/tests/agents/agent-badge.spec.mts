import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// The playwright test data seeds a 'test-reviewer' user with an agent row.
// See: backend/scripts/seeds/playwright-test-data.mts
const AGENT_USERNAME = 'test-reviewer'

test.describe('Official account badge', () => {
  test('shows public official badge on agent user profile page', async ({ page }) => {
    await navigateTo(page, `/user/${AGENT_USERNAME}`)

    const profileHeader = page.getByTestId('user-profile-header')
    await expect(profileHeader.getByText('official')).toBeVisible()
    await expect(profileHeader.getByTestId('agent-badge')).not.toBeAttached()
  })
})
