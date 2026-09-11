import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Chase Sapphire Preferred — seeded card topic always available in the autocomplete
const SEEDED_CARD_SEARCH = 'Chase'

let contributorId = ''

test.beforeAll(async () => {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  if (!user) throw new Error('Failed to create data point contributor')
  contributorId = user.id
})

test.describe('Data point create — credit card submit', () => {
  test('an aged contributor can submit a credit card data point and is redirected to the post detail', async ({
    page,
  }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    // Select credit-card vertical
    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-credit-card').click()

    // Credit score range is required by the CC schema
    await page.getByTestId('data-point-credit-score-trigger').click()
    await page.getByRole('listbox').getByRole('option', { name: '740–799 (Very Good)' }).click()
    await expect(page.getByRole('listbox')).toBeHidden()

    // Fill the card topic autocomplete with the seeded card
    const autocompleteInput = page.getByTestId('topic-autocomplete-input')
    await autocompleteInput.click()
    await autocompleteInput.pressSequentially(SEEDED_CARD_SEARCH)
    await expect(page.getByTestId('topic-autocomplete-item').first()).toBeVisible()
    await page.getByTestId('topic-autocomplete-item').first().click()

    // Select result: Approved
    await page.getByTestId('credit-card-result-trigger').click()
    await page.getByRole('listbox').getByRole('option', { name: 'Approved' }).click()
    await expect(page.getByRole('listbox')).toBeHidden()

    // Content is required by the form validator (markdown must be non-empty)
    await page
      .getByTestId('post-form-content-textarea')
      .pressSequentially('Applied for this card and was approved.')

    // Wait for Turnstile stub token — navigateTo installs the stub automatically
    await expect(page.getByTestId('turnstile-container')).toBeVisible()
    await expect(page.getByTestId('post-form-submit')).toBeEnabled()
    await page.getByTestId('post-form-submit').click()

    // Redirect to the new data-point detail page
    await expect(page).toHaveURL(/\/data-point\//)
    await expect(page.getByTestId('post-detail-heading')).toBeVisible()
  })
})
