import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'

let testUserId = ''

test.beforeAll(async () => {
  const random = randomSuffix()
  const usernameSuffix = random.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])
  const user = await createTestUser({ username: `refund-e2e-${usernameSuffix}` })
  if (!user) throw new Error('Failed to create test user')
  testUserId = user.id
})

test.describe('Membership Refund Panel — Admin', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can see the refund panel', async ({ page }) => {
    await navigateTo(page, `/user/${testUserId}/admin`)
    await expect(page.getByTestId('membership-refund-title')).toBeVisible()
  })

  test('admin sees empty state for user with no Stripe subscription', async ({ page }) => {
    await navigateTo(page, `/user/${testUserId}/admin`)
    await expect(page.getByTestId('membership-refund-empty')).toBeVisible()
  })

  test('admin sees refund form when charges are available', async ({ page }) => {
    const fakeCharge = {
      charges: [
        {
          invoice_id: 'in_test_123',
          charge_id: 'ch_test_123',
          payment_intent_id: null,
          amount: { amount: 1999, currency: 'usd' },
          amount_refunded: { amount: 0, currency: 'usd' },
          created_at: '2024-01-01T00:00:00.000Z',
          description: 'Playwright community membership',
        },
      ],
    }
    await page.route('**/api/v1/memberships/refundable-charges*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fakeCharge),
      }),
    )
    await navigateTo(page, `/user/${testUserId}/admin`)
    await expect(page.getByTestId('membership-refund-form')).toBeVisible()
    await expect(page.getByTestId('membership-refund-charge-list')).toBeVisible()
    await expect(page.getByTestId('membership-refund-charge-option')).toBeVisible()
    await expect(page.getByTestId('membership-refund-reason-select')).toBeVisible()
    await expect(page.getByTestId('membership-refund-amount-input')).toBeVisible()
    await expect(page.getByTestId('membership-refund-revoke-checkbox')).toBeVisible()
    await expect(page.getByTestId('membership-refund-note-textarea')).toBeVisible()
    await expect(page.getByTestId('membership-refund-submit-button')).toBeVisible()
  })
})
