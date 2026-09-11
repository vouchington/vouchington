import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

let contributorId: string

test.beforeAll(async () => {
  const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  if (!contributor) throw new Error('Failed to create data point contributor')
  contributorId = contributor.id
})

test.describe('Data Points Page', () => {
  test('should display data points list page', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points')

    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('Data Points')
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
  })
})

test.describe('Create Data Point Page', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/data-points/create')
    // Should redirect to login
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('shows create form for authenticated user', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')

    await expect(page.getByTestId('new-data-point-heading')).toBeVisible()

    // The form should contain DataPointFields with vertical selector
    await expect(page.getByTestId('data-point-vertical-label')).toBeVisible()
  })

  test('shows credit card fields when credit card vertical selected', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    // Select credit card vertical
    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-credit-card').click()

    // Credit card specific fields should appear
    await expect(page.getByTestId('credit-card-topic-label')).toBeVisible()
    await expect(page.getByTestId('credit-card-result-label')).toBeVisible()
    await expect(page.getByTestId('data-point-credit-score-label')).toBeVisible()
  })

  test('shows bank account fields when bank account vertical selected', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    // Select bank account vertical
    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-bank-account').click()

    // Bank account specific fields should appear
    await expect(page.getByTestId('bank-account-topic-label')).toBeVisible()
    await expect(page.getByTestId('bank-account-result-label')).toBeVisible()
    await expect(page.getByTestId('bank-account-type-label')).toBeVisible()
  })

  test('hides credit-card-only profile fields when switching to bank account', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    // Select credit card — profile section should show CC-only fields
    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-credit-card').click()
    await expect(page.getByTestId('data-point-credit-score-label')).toBeVisible()
    await expect(page.getByTestId('credit-card-profile-inquiries-label')).toBeVisible()

    // Switch to bank account — credit card-only profile fields should disappear
    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-bank-account').click()
    await expect(page.getByTestId('credit-card-profile-inquiries-label')).toBeHidden()
    await expect(page.getByTestId('bank-account-type-label')).toBeVisible()
  })

  test('shows Your Profile section with profile fields for credit card vertical', async ({
    page,
  }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-credit-card').click()

    // Profile section legend should be visible
    await expect(page.getByTestId('data-point-profile-legend')).toBeVisible()

    // Profile fields
    await expect(page.getByTestId('data-point-credit-score-label')).toBeVisible()
    const incomeMinimum = page.getByTestId('data-point-income-minimum-field').getByRole('textbox')
    const incomeMaximum = page.getByTestId('data-point-income-maximum-field').getByRole('textbox')
    await expect(incomeMinimum).toBeVisible()
    await expect(incomeMinimum).toHaveAttribute('inputmode', 'decimal')
    await expect(incomeMaximum).toBeVisible()
    await expect(incomeMaximum).toHaveAttribute('inputmode', 'decimal')
    await expect(incomeMaximum).toBeDisabled()
    await expect(page.getByTestId('credit-card-profile-inquiries-label')).toBeVisible()
    await expect(page.getByTestId('credit-card-profile-cards-24m-label')).toBeVisible()
    const totalCreditLimit = page
      .getByTestId('credit-card-profile-total-limit-field')
      .getByRole('textbox')
    await expect(totalCreditLimit).toBeVisible()
    await expect(totalCreditLimit).toHaveAttribute('type', 'text')
    await expect(totalCreditLimit).toHaveAttribute('inputmode', 'decimal')
    await expect(page.getByTestId('credit-card-profile-years-label')).toBeVisible()

    // Data-point section: card, result should be present
    await expect(page.getByTestId('credit-card-topic-label')).toBeVisible()
    await expect(page.getByTestId('credit-card-result-label')).toBeVisible()
  })

  test('"Save changes to my profile" checkbox is unchecked by default', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-credit-card').click()

    const saveCheckbox = page.getByTestId('data-point-save-to-profile-checkbox')
    await expect(saveCheckbox).toBeVisible()
    await expect(saveCheckbox).not.toBeChecked()
  })
})
