import { test, expect, type Page } from '../../helpers/test.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

async function navigateToPlans(page: Page): Promise<void> {
  await navigateTo(page, '/plans')
}

test.describe('Plans Page', () => {
  test.beforeEach(async ({ page }) => {
    await setFeatureFlags(page, { memberships: true, membershipStripeBilling: true })
  })

  test('displays page heading', async ({ page }) => {
    await navigateToPlans(page)

    await expect(page.getByTestId('plans-page-heading')).toContainText('Plans')
  })

  test('comparison table has Plus and Pro plan columns', async ({ page }) => {
    await navigateToPlans(page)

    await expect(page.getByTestId('plan-comparison-column-plus')).toBeVisible()
    await expect(page.getByTestId('plan-comparison-column-pro')).toBeVisible()
  })

  test('has monthly and yearly toggle buttons', async ({ page }) => {
    await navigateToPlans(page)

    await expect(page.getByTestId('plan-billing-monthly-button')).toBeVisible()
    await expect(page.getByTestId('plan-billing-yearly-button')).toBeVisible()
  })

  test('shows subscribe buttons for each plan', async ({ page }) => {
    await navigateToPlans(page)

    await expect(page.getByTestId('subscribe-to-plus-button')).toBeVisible()
    await expect(page.getByTestId('subscribe-to-pro-button')).toBeVisible()
  })

  test('routes signed-out Plus purchase-intent clicks to login without creating an intent', async ({
    page,
  }) => {
    let purchaseIntentRequested = false
    await page.route('**/api/v1/membership-purchase-intents', async route => {
      purchaseIntentRequested = true
      await route.fulfill({
        status: 599,
        contentType: 'text/plain',
        body: 'unexpected purchase intent request',
      })
    })

    await navigateToPlans(page)
    await expect(page.getByTestId('subscribe-to-plus-button')).toHaveAttribute(
      'href',
      '/login?next=%2Fplans&intent=subscribe',
    )
    await expect(page.getByTestId('subscribe-to-pro-button')).toHaveAttribute(
      'href',
      '/login?next=%2Fplans&intent=subscribe',
    )
    await page.getByTestId('subscribe-to-plus-button').click()

    await expect(page).toHaveURL(/\/login\?next=%2Fplans&intent=subscribe$/)
    expect(purchaseIntentRequested).toBe(false)
  })
})
