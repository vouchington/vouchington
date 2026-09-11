import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestAiUsageRecord } from '../../../backend/test-helpers/index.mts'

// Seeded playwright community owned by the test admin user.
const PLAYWRIGHT_COMMUNITY_ID = '019c0000-0000-7000-8000-000000000010'

test.describe('Admin AI Costs', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await insertTestAiUsageRecord({
      communityId: PLAYWRIGHT_COMMUNITY_ID,
      agentSlug: 'ai-costs-spec',
      inputTokens: 200,
      outputTokens: 80,
      // 0.000042 USD expressed in microunits (the ledger's cost_microunits scale).
      costMicrounits: 42,
    })
  })

  test('shows AI costs page container', async ({ page }) => {
    await navigateTo(page, '/admin/ai-costs')
    await expect(page.getByTestId('admin-ai-costs')).toBeVisible()
  })

  test('shows cost row when usage data is present', async ({ page }) => {
    await navigateTo(page, '/admin/ai-costs')
    await expect(page.getByTestId('admin-ai-costs-row').first()).toBeVisible()
  })

  test('hides empty state when usage data is present', async ({ page }) => {
    await navigateTo(page, '/admin/ai-costs')
    await expect(page.getByTestId('admin-ai-costs-empty')).toHaveCount(0)
  })
})
