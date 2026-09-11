import { expect, test } from '../helpers/test.mts'
import { AUTH_STATE } from '../helpers/auth-state.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { randomSuffix } from '../helpers/random-id.mts'
import { insertTestTopic } from '../helpers/insert-test-topic.mts'

test.describe('Topic Recommendation Duplicate Check', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows loading state immediately after typing (pre-debounce)', async ({ page }) => {
    const stamp = randomSuffix()
    const topicTitle = `Duplicate Loading Test ${stamp}`

    await navigateTo(page, '/topic-recommendations/create')
    // pressSequentially triggers React onChange events per keystroke. Once the
    // query reaches minLength (3), the hook sets isLoading=true synchronously
    // (before the 400ms debounce fires the fetch), so the loading indicator is
    // visible immediately after the last keystroke.
    await page.getByTestId('topic-recommendation-form-topic-title').pressSequentially(topicTitle)

    await expect(page.getByTestId('duplicate-check-loading')).toBeVisible()
  })

  test('shows blocking error with topic link when an exact topic match is found', async ({
    page,
  }) => {
    const stamp = randomSuffix()
    const topicName = `Duplicate Exact Topic ${stamp}`
    const topicSlug = `duplicate-exact-topic-${stamp}`
    await insertTestTopic(topicName, topicSlug)

    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').pressSequentially(topicName)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)

    await expect(page.getByTestId('duplicate-check-results')).toBeVisible()
    await expect(page.getByTestId('duplicate-check-exact-topic')).toBeVisible()

    const link = page.getByTestId('duplicate-check-exact-topic-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText(topicName)
    await expect(link).toHaveAttribute('href', new RegExp(topicSlug))

    // Submit button must be disabled when an exact duplicate is found.
    await expect(page.getByTestId('topic-recommendation-form-submit')).toBeDisabled()
  })

  test('shows blocking warning with upvote link when a pending recommendation exists for the same topic', async ({
    page,
    browser,
  }) => {
    const stamp = randomSuffix()
    const topicTitle = `Duplicate Pending Rec ${stamp}`
    const topicSlug = `duplicate-pending-rec-${stamp}`

    // Create a pending recommendation via the UI first, then switch users.
    const context = await browser.newContext({ storageState: AUTH_STATE })
    const setupPage = await context.newPage()
    await navigateTo(setupPage, '/topic-recommendations/create')
    await setupPage.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await setupPage.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await setupPage
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('First recommendation for this topic.')
    await setupPage
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This topic deserves to be in the catalog.')
    await expect(setupPage.getByTestId('topic-recommendation-form-submit')).toBeEnabled()
    await setupPage.getByTestId('topic-recommendation-form-submit').click()
    await expect(setupPage).toHaveURL(/\/topic-recommendations$/)
    await context.close()

    // Now a second user opens the create form for the same topic.
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').pressSequentially(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)

    await expect(page.getByTestId('duplicate-check-results')).toBeVisible()
    await expect(page.getByTestId('duplicate-check-pending-rec')).toBeVisible()

    const link = page.getByTestId('duplicate-check-pending-rec-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/topic-recommendations')

    // Submit button must be disabled when a pending duplicate is found.
    await expect(page.getByTestId('topic-recommendation-form-submit')).toBeDisabled()
  })
})
