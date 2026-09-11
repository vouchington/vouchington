import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '../../../backend/test-helpers/index.mts'

let userId: string
let topicName: string
let topicSuffix: string

test.beforeAll(async () => {
  topicSuffix = randomSuffix()
  topicName = `Identity Required Test Topic ${topicSuffix}`
  const topicSlug = `identity-req-topic-${topicSuffix}`
  await insertTestTopic(topicName, topicSlug)
})

test.beforeEach(async () => {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noUsername: true })
  if (!user) throw new Error('Failed to create test user')
  userId = user.id
})

test.describe('reviews/create — Post anonymously toggle', () => {
  test('toggles when description text is clicked', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/reviews/create')

    await page.getByTestId('post-form-advanced-toggle').click()
    const checkbox = page.getByTestId('post-form-anonymous-checkbox').getByRole('checkbox')
    await expect(checkbox).not.toBeChecked()

    await page.getByTestId('post-form-anonymous-checkbox').click()
    await expect(checkbox).toBeChecked()

    await page.getByTestId('post-form-anonymous-checkbox').click()
    await expect(checkbox).not.toBeChecked()
  })
})

test.describe('reviews/create — IDENTITY_REQUIRED gate', () => {
  test('shows username dialog instead of toast when posting without a username', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/reviews/create')

    const suffix = randomSuffix()
    await page
      .getByTestId('post-form-title-input')
      .pressSequentially(`Identity Test Review ${suffix}`)

    // Add a topic via autocomplete
    await page.getByTestId('topic-autocomplete-input').pressSequentially(topicSuffix)
    const topicOption = page
      .getByTestId('topic-autocomplete-item')
      .filter({ hasText: topicName })
      .first()
    await expect(topicOption).toBeVisible()
    await topicOption.click()

    // Set a star rating (5 stars)
    await page.getByTestId('star-rating-5').first().click()

    // Fill in enough content to meet review minimums (150+ chars, 30+ words, 3+ sentences)
    const longContent =
      `This is a test review for the identity required feature. ` +
      `It needs to be long enough to pass the minimum length check. ` +
      `Here is a third sentence to make sure we have enough sentences for validation.`
    await page.getByTestId('post-form-content-textarea').pressSequentially(longContent)

    // Submit — should trigger the IDENTITY_REQUIRED 403
    await page.getByTestId('post-form-submit').click()

    // Dialog should appear instead of a toast
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    // Enter a username and confirm
    const username = `identity-test-${suffix}`
    await page.getByTestId('username-required-dialog-input').pressSequentially(username)
    await page.getByTestId('username-required-dialog-submit').click()

    // Should navigate to the new review detail page
    await page.waitForURL(/\/review\//)
    await expect(page.getByTestId('post-detail-heading')).toContainText(/identity test review/i)
  })

  test('dismissing the username dialog re-enables the Post button', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/reviews/create')

    const suffix = randomSuffix()
    await page
      .getByTestId('post-form-title-input')
      .pressSequentially(`Cancel Dialog Test ${suffix}`)
    await page.getByTestId('topic-autocomplete-input').pressSequentially(topicSuffix)
    const topicOption = page
      .getByTestId('topic-autocomplete-item')
      .filter({ hasText: topicName })
      .first()
    await expect(topicOption).toBeVisible()
    await topicOption.click()
    await page.getByTestId('star-rating-5').first().click()
    const content =
      `This review tests that dismissing the username dialog re-enables the submit button correctly. ` +
      `It has plenty of words and content to pass all the form validations in the review form. ` +
      `This third sentence ensures we meet the minimum sentence and word count required by validation.`
    await page.getByTestId('post-form-content-textarea').pressSequentially(content)

    await page.getByTestId('post-form-submit').click()
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    // Dismiss the dialog
    await page.getByTestId('username-required-dialog-cancel').click()

    // Post button must be re-enabled
    await expect(page.getByTestId('post-form-submit')).toBeEnabled()
  })
})
