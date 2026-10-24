import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { createTestMembership } from '../../../backend/test-helpers/entities/memberships.mts'

test.describe('Membership test ids', () => {
  test.beforeEach(async ({ page }) => {
    await setFeatureFlags(page, { memberships: true, membershipStripeBilling: true })
  })

  test('member without a membership is offered the plans', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/membership')
    await expect(page.getByTestId('membership-view-plans')).toBeVisible()

    await navigateTo(page, '/plans')
    await expect(page.getByTestId('free-plan-card-current-plan')).toBeVisible()
    await expect(page.getByTestId('plan-feature-label-trigger').first()).toBeAttached()
  })

  test('granted member sees the current paid plan', async ({ page }) => {
    const user = await withCleanUser(page)
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    await navigateTo(page, '/plans')

    await expect(page.getByTestId('paid-plan-card-current-plan')).toBeVisible()
  })

  test('Stripe subscriber can open the billing portal', async ({ page }) => {
    const user = await withCleanUser(page)
    await createTestMembership({
      user_id: user.id,
      plan: 'plus',
      stripe_customer_id: `cus_pw_${randomSuffix()}`,
    })
    await navigateTo(page, '/my/membership')
    await expect(page.getByTestId('membership-status-manage-billing-portal')).toBeVisible()

    await navigateTo(page, '/plans')
    await expect(page.getByTestId('billing-portal-button-open-billing-portal')).toBeVisible()
  })
})
