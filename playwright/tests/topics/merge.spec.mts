import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

let srcId = ''
let srcName = ''
let dstSlug = ''
let dstName = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  srcName = `Merge Source ${suffix}`
  const src = await insertTestTopic(srcName, `merge-src-${suffix}`)
  srcId = src.id

  dstName = `Merge Dest ${suffix}`
  dstSlug = `merge-dst-${suffix}`
  await insertTestTopic(dstName, dstSlug)
})

test.describe('Topic merge', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can merge a topic into another and is redirected to the destination aliases page', async ({
    page,
  }) => {
    await navigateTo(page, `/topic/${srcId}/settings/merge`)
    await waitForBelowFoldHydration(page)

    // Select destination via TopicAutocomplete
    const autocompleteInput = page.getByTestId('topic-autocomplete-input')
    await autocompleteInput.pressSequentially(dstName)
    const destinationOption = page
      .getByTestId('topic-autocomplete-item')
      .filter({ hasText: dstName })
    await expect(destinationOption).toBeVisible()
    await destinationOption.click()

    // Confirm the merge by typing the source topic name
    await page.getByTestId('merge-topic-confirmation-input').pressSequentially(srcName)

    // Submit — real backend merge (POST /topics/:id/merges)
    await page.getByTestId('merge-topic-submit').click()

    // Assert toast and redirect to destination's settings/aliases page
    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText('Merged')
    await expect(page).toHaveURL(`/topic/${dstSlug}/settings/aliases`)
  })
})
