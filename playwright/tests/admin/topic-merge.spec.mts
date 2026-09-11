import { test, expect } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Admin Topic Merge', () => {
  test.use({ storageState: AUTH_STATE })

  let sourceTopicId: string
  let sourceTopicName: string
  let destSlug: string
  let destTopicName: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    sourceTopicName = `Merge Source ${suffix}`
    const source = await insertTestTopic(sourceTopicName, `merge-source-${suffix}`)
    destTopicName = `Merge Dest ${suffix}`
    destSlug = `merge-dest-${suffix}`
    await insertTestTopic(destTopicName, destSlug)
    sourceTopicId = source.id
  })

  test('merges source topic into destination and redirects to aliases page', async ({ page }) => {
    await navigateTo(page, `/topic/${sourceTopicId}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toBeVisible()

    // The autocomplete input is pre-filled with the label text; triple-click to select-all first
    await page.getByTestId('topic-autocomplete-input').click({ clickCount: 3 })
    await page.getByTestId('topic-autocomplete-input').pressSequentially(destTopicName)
    const autocompleteItem = page
      .getByTestId('topic-autocomplete-item')
      .filter({ hasText: destTopicName })
      .first()
    await expect(autocompleteItem).toBeVisible()
    await autocompleteItem.click()

    await page.getByTestId('merge-topic-confirmation-input').pressSequentially(sourceTopicName)

    await expect(page.getByTestId('merge-topic-submit')).toBeEnabled()
    await page.getByTestId('merge-topic-submit').click()

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText('Merged')
    await expect(page).toHaveURL(new RegExp(`/topic/${destSlug}/settings/aliases$`))
  })
})
