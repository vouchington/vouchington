import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  insertTestBankAccount,
} from '../../../backend/test-helpers/index.mts'

const SEEDED_ADMIN_ID = '019f0000-0000-7000-8000-000000000000'

let contributorId: string
let bankTopicName: string

test.beforeAll(async () => {
  const suffix = randomSuffix()
  bankTopicName = `Test Bank ${suffix}`
  const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  if (!contributor) throw new Error('Failed to create contributor')
  contributorId = contributor.id
  await insertTestBankAccount({ createdById: SEEDED_ADMIN_ID, name: bankTopicName })
})

test.describe('Data Point Create — submit redirects to post detail', () => {
  test('submitting a bank account data point redirects to /data-point/:slug', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, '/data-points/create')
    await waitForBelowFoldHydration(page)

    const suffix = randomSuffix()

    await page.getByTestId('data-point-vertical-trigger').press(' ')
    await page.getByTestId('data-point-vertical-option-bank-account').click()

    await page.getByTestId('topic-autocomplete-input').pressSequentially(bankTopicName)
    await page.getByTestId('topic-autocomplete-item').filter({ hasText: bankTopicName }).click()

    await page.getByLabel('Result *').click()
    await page.getByRole('listbox').getByRole('option', { name: 'Approved' }).click()

    await page.getByTestId('post-form-title-input').pressSequentially(`Test Data Point ${suffix}`)
    await page
      .getByTestId('post-form-content-textarea')
      .pressSequentially('Test data point content.')

    await expect(page.getByTestId('post-form-submit')).toBeEnabled()
    await page.getByTestId('post-form-submit').click()

    await expect(page).toHaveURL(/\/data-point\/[^/]+$/)
  })
})
