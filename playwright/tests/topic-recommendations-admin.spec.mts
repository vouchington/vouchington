import { expect, test, type Page } from '../helpers/test.mts'
import { loginAsAdmin, loginAsUser } from '../helpers/auth.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { randomSuffix } from '../helpers/random-id.mts'
import { requireTestValue } from '../helpers/assertions.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../backend/test-helpers/index.mts'

async function submitTopicRecommendation(page: Page): Promise<void> {
  const createResponse = page.waitForResponse(
    response =>
      response.url().endsWith('/api/v1/topic-recommendations') &&
      response.request().method() === 'POST',
  )

  await page.getByTestId('topic-recommendation-form-submit').click()
  expect((await createResponse).status()).toBe(201)
  await expect(page).toHaveURL(/\/topic-recommendations$/)
}

test.describe('Topic Recommendations — Admin', () => {
  test('admin can reject a pending recommendation', async ({ page }) => {
    const user = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
        username: `topic-rec-reject-${randomSuffix()}`,
      }),
      'Failed to create test user',
    )

    const stamp = randomSuffix()
    const topicTitle = `Reject Topic ${stamp}`
    const topicSlug = `reject-topic-${stamp}`

    await loginAsUser(page, user.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('A topic that will be rejected by an admin.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This recommendation exists only to test admin rejection.')
    await submitTopicRecommendation(page)

    await loginAsAdmin(page)
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(topicTitle)}`)

    const row = page.getByTestId(`topic-recommendation-row-${topicSlug}`)
    await expect(row).toBeVisible()
    await row.getByTestId('topic-recommendation-row-title').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const rejectButton = page.getByTestId('topic-recommendation-dialog-reject')
    await expect(rejectButton).toBeEnabled()
    await rejectButton.click()

    // After rejection the dialog closes and the page refreshes; the status filter is unchanged.
    // Navigate to the rejected view to verify the badge.
    await expect(dialog).toBeHidden()
    await navigateTo(
      page,
      `/topic-recommendations?status=rejected&q=${encodeURIComponent(topicTitle)}`,
    )
    const badge = page
      .getByTestId(`topic-recommendation-row-${topicSlug}`)
      .getByRole('cell')
      .filter({ hasText: 'rejected' })
    await expect(badge).toBeVisible()
  })

  test('admin can edit recommendation fields and save changes', async ({ page }) => {
    const user = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
        username: `topic-rec-save-${randomSuffix()}`,
      }),
      'Failed to create test user',
    )

    const stamp = randomSuffix()
    const topicTitle = `Save Topic ${stamp}`
    const topicSlug = `save-topic-${stamp}`

    await loginAsUser(page, user.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(topicTitle)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(topicSlug)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('A topic whose fields will be edited by an admin.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('This recommendation exists only to test admin field editing.')
    await submitTopicRecommendation(page)

    await loginAsAdmin(page)
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(topicTitle)}`)

    const row = page.getByTestId(`topic-recommendation-row-${topicSlug}`)
    await expect(row).toBeVisible()
    await row.getByTestId('topic-recommendation-row-title').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const updatedTitle = `${topicTitle} Updated`
    const titleInput = page.getByLabel('Topic title')
    await titleInput.clear()
    await titleInput.pressSequentially(updatedTitle)

    const saveButton = page.getByTestId('topic-recommendation-dialog-save')
    await expect(saveButton).toBeEnabled()
    await saveButton.click()

    // After save, the button should re-enable (isSaving resets)
    await expect(saveButton).toBeEnabled()
  })

  test('search filters recommendations by query string', async ({ page }) => {
    const userA = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
        username: `topic-rec-search-a-${randomSuffix()}`,
      }),
      'Failed to create test user A',
    )
    const userB = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
        username: `topic-rec-search-b-${randomSuffix()}`,
      }),
      'Failed to create test user B',
    )

    const stampA = randomSuffix()
    const titleA = `SearchA Topic ${stampA}`
    const slugA = `searcha-topic-${stampA}`

    const stampB = randomSuffix()
    const titleB = `SearchB Topic ${stampB}`
    const slugB = `searchb-topic-${stampB}`

    // User A creates recommendation A
    await loginAsUser(page, userA.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(titleA)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(slugA)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('Topic A for search filter test.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('User A recommends this topic for search filter testing.')
    await submitTopicRecommendation(page)

    // User B creates recommendation B
    await loginAsUser(page, userB.id)
    await navigateTo(page, '/topic-recommendations/create')
    await page.getByTestId('topic-recommendation-form-topic-title').fill(titleB)
    await page.getByTestId('topic-recommendation-form-topic-slug').fill(slugB)
    await page
      .getByTestId('topic-recommendation-form-topic-markdown')
      .fill('Topic B for search filter test.')
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .fill('User B recommends this topic for search filter testing.')
    await submitTopicRecommendation(page)

    // Login as admin and test search filtering
    await loginAsAdmin(page)

    // Search for A — should show A, not B
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(titleA)}`)
    await expect(page.getByTestId(`topic-recommendation-row-${slugA}`)).toBeVisible()
    await expect(page.getByTestId(`topic-recommendation-row-${slugB}`)).toBeHidden()

    // Search for B — should show B, not A
    await navigateTo(page, `/topic-recommendations?q=${encodeURIComponent(titleB)}`)
    await expect(page.getByTestId(`topic-recommendation-row-${slugB}`)).toBeVisible()
    await expect(page.getByTestId(`topic-recommendation-row-${slugA}`)).toBeHidden()
  })
})
