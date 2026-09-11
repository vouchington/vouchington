import { test, expect, type Page } from '../../helpers/test.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { openRadixDropdown } from '../../helpers/radix-select.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'

async function selectSeededSkuOption(page: Page): Promise<string> {
  const options = page.getByRole('listbox').getByRole('option')
  await expect(options).toHaveCount(2)
  const option = options.first()
  const testId = requireTestValue(
    await option.getAttribute('data-pw'),
    'Seeded membership SKU option must have a test id',
  )
  await expect(option).toHaveAttribute('data-pw', /^memberships-grant-sku-option-/)
  await option.dispatchEvent('click')
  return testId
}

test.describe('Admin Memberships', () => {
  test.use({ storageState: AUTH_STATE })

  test('displays page heading when feature is enabled', async ({ page }) => {
    await setFeatureFlags(page, { memberships: true })
    await navigateTo(page, '/memberships/grants')

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('Membership')
  })
})

test.describe('Admin Memberships — grant flow', () => {
  test.use({ storageState: AUTH_STATE })

  test('force-remount clears user input after a successful grant', async ({ page }) => {
    const suffix = randomSuffix()
    const user = requireTestValue(
      await createTestUser({ username: `mgtest-${suffix}` }),
      'Failed to create test user',
    )
    await setFeatureFlags(page, { memberships: true })
    await navigateTo(page, '/memberships/grants')

    // Select the user via autocomplete
    const userInput = page.getByTestId('memberships-grant-user-input')
    await userInput.pressSequentially(user.username!)
    await expect(page.getByTestId('memberships-grant-user-item').first()).toBeAttached()
    await page.getByTestId('memberships-grant-user-item').first().click()

    await page.getByTestId('memberships-grant-duration-days').pressSequentially('30')

    // Select Plus plan
    await openRadixDropdown(page.getByTestId('memberships-grant-plan-trigger'))
    await expect(page.getByTestId('memberships-grant-plan-option-plus')).toBeAttached()
    await page.getByTestId('memberships-grant-plan-option-plus').click()

    // Wait for Plus SKUs to load and select one
    const skuTrigger = page.getByTestId('memberships-grant-sku-trigger')
    await expect(skuTrigger).toBeEnabled()
    await openRadixDropdown(skuTrigger)
    await selectSeededSkuOption(page)

    // Submit the grant
    await page.getByTestId('memberships-grant-submit').click()

    // Assert success message appears
    await expect(page.getByTestId('memberships-grant-success')).toContainText(
      'Membership granted successfully.',
    )

    // Assert the user input was cleared by the force-remount (key={userKey})
    // — the previously entered username must not remain in the field
    await expect(userInput).toHaveValue('')
  })

  test('changing plan clears and repopulates the SKU select', async ({ page }) => {
    await setFeatureFlags(page, { memberships: true })
    await navigateTo(page, '/memberships/grants')

    const skuTrigger = page.getByTestId('memberships-grant-sku-trigger')

    // Select Plus plan
    await openRadixDropdown(page.getByTestId('memberships-grant-plan-trigger'))
    await expect(page.getByTestId('memberships-grant-plan-option-plus')).toBeAttached()
    await page.getByTestId('memberships-grant-plan-option-plus').click()

    // Wait for Plus SKUs to load and select one
    await expect(skuTrigger).toBeEnabled()
    await openRadixDropdown(skuTrigger)
    const plusSkuOptionTestId = await selectSeededSkuOption(page)
    // Trigger now shows the selected SKU (not the placeholder)
    await expect(skuTrigger).not.toContainText('Select SKU')

    // Switch to Pro plan
    await openRadixDropdown(page.getByTestId('memberships-grant-plan-trigger'))
    await expect(page.getByTestId('memberships-grant-plan-option-pro')).toBeAttached()
    await page.getByTestId('memberships-grant-plan-option-pro').click()

    // SKU field resets immediately (synchronous dispatch in handlePlanChange)
    await expect(skuTrigger).toContainText('Select SKU')

    // After Pro SKUs load, the dropdown shows only Pro options
    await expect(skuTrigger).toBeEnabled()
    await openRadixDropdown(skuTrigger)
    const proSkuOption = page.getByRole('listbox').getByRole('option').first()
    await expect(proSkuOption).toHaveAttribute('data-pw', /^memberships-grant-sku-option-/)
    // The previously selected Plus SKU option is no longer present
    await expect(page.getByTestId(plusSkuOptionTestId)).not.toBeAttached()
  })

  test('stale fetchPlans response is discarded when plan changes rapidly (latestPlanRef guard)', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const plusSkuId = `test-plus-stale-${suffix}`
    const proSkuId = `test-pro-stale-${suffix}`

    // Both responses carry identical plan data — the page must use latestPlanRef
    // to discard whichever request resolves out of order.
    const plansBody = JSON.stringify({
      products: [
        {
          id: plusSkuId,
          plan: 'plus',
          interval: 'monthly',
          providers: [
            {
              provider: 'stripe',
              environment: 'test',
              application_id: 'voucha-web',
              product_id: `price_plus_${suffix}`,
              base_plan_id: null,
              offer_id: null,
              sku_id: null,
              price: { amount: 500, currency: 'usd' },
            },
          ],
        },
        {
          id: proSkuId,
          plan: 'pro',
          interval: 'monthly',
          providers: [
            {
              provider: 'stripe',
              environment: 'test',
              application_id: 'voucha-web',
              product_id: `price_pro_${suffix}`,
              base_plan_id: null,
              offer_id: null,
              sku_id: null,
              price: { amount: 2000, currency: 'usd' },
            },
          ],
        },
      ],
      benefit_catalog: { version: 1, groups: [] },
    })

    // Hold request 1 (Plus) until request 2 (Pro) fulfills, simulating a
    // slow Plus response that arrives after the Pro response.
    let releaseFirst!: () => void
    const firstHeld = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    let requestIndex = 0

    await page.route('**/api/v1/memberships/plans', async route => {
      const idx = ++requestIndex
      if (idx === 1) {
        await firstHeld
        await route.fulfill({ status: 200, contentType: 'application/json', body: plansBody })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: plansBody })
        releaseFirst()
      }
    })

    await setFeatureFlags(page, { memberships: true })
    await navigateTo(page, '/memberships/grants')

    // Select Plus — fires request 1, which is held by the route handler
    await openRadixDropdown(page.getByTestId('memberships-grant-plan-trigger'))
    await expect(page.getByTestId('memberships-grant-plan-option-plus')).toBeAttached()
    await page.getByTestId('memberships-grant-plan-option-plus').click()

    // Switch to Pro — fires request 2, which fulfills immediately and then
    // releases request 1 (simulating a late arrival of the Plus response)
    await openRadixDropdown(page.getByTestId('memberships-grant-plan-trigger'))
    await expect(page.getByTestId('memberships-grant-plan-option-pro')).toBeAttached()
    await page.getByTestId('memberships-grant-plan-option-pro').click()

    // The SKU list must show only Pro options — the stale Plus response is discarded
    // by the latestPlanRef guard (latestPlanRef.current === 'pro' !== 'plus')
    const skuTrigger = page.getByTestId('memberships-grant-sku-trigger')
    await expect(skuTrigger).toBeEnabled()
    await openRadixDropdown(skuTrigger)
    await expect(page.getByTestId(`memberships-grant-sku-option-${proSkuId}`)).toBeAttached()
    await expect(page.getByTestId(`memberships-grant-sku-option-${plusSkuId}`)).not.toBeAttached()
  })

  test('fetchPlans network failure shows error message', async ({ page }) => {
    await page.route('**/api/v1/memberships/plans', async route => {
      await route.fulfill({ status: 500 })
    })

    await setFeatureFlags(page, { memberships: true })
    await navigateTo(page, '/memberships/grants')

    // Select Plus — triggers fetchPlans which will fail
    await openRadixDropdown(page.getByTestId('memberships-grant-plan-trigger'))
    await expect(page.getByTestId('memberships-grant-plan-option-plus')).toBeAttached()
    await page.getByTestId('memberships-grant-plan-option-plus').click()

    await expect(page.getByTestId('memberships-grant-error')).toContainText(
      'Failed to load SKUs for selected plan',
    )
  })
})
