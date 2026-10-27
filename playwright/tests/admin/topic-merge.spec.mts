import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { ADMIN_AUTH_STATE } from '../../helpers/auth-state.mts'
import { completeTopicMerge } from '../../helpers/complete-topic-merge.mts'
import type { TopicMergeResponseBody } from '../../../web/types/api-responses/topic-merges.ts'

test.describe('Admin Topic Merge', () => {
  test.use({ storageState: ADMIN_AUTH_STATE })

  let sourceTopicId: string
  let sourceTopicName: string
  let destSlug: string
  let destTopicName: string

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    sourceTopicName = `Merge Source ${suffix}`
    const source = await insertTestTopic(sourceTopicName, `merge-source-${suffix}`)
    destTopicName = `Merge Dest ${suffix}`
    destSlug = `merge-dest-${suffix}`
    await insertTestTopic(destTopicName, destSlug)
    sourceTopicId = source.id
  })

  test('queues a merge and checks completion before navigating to aliases', async ({ page }) => {
    await navigateTo(page, `/topic/${sourceTopicId}/settings/merge`)
    await expect(page.getByTestId('topic-settings-merge')).toBeVisible()

    // The autocomplete input is pre-filled with the label text; triple-click to select-all first
    await page.getByTestId('topic-autocomplete-input').click({ clickCount: 3 })
    await page.getByTestId('topic-autocomplete-input').pressSequentially(destTopicName)
    const autocompleteItem = page
      .getByTestId('topic-autocomplete-item')
      .filter({ hasText: destTopicName })
    await expect(autocompleteItem).toBeVisible()
    await autocompleteItem.click()

    await page.getByTestId('merge-topic-confirmation-input').pressSequentially(sourceTopicName)

    await expect(page.getByTestId('merge-topic-submit')).toBeEnabled()
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/v1/topics/${sourceTopicId}/merges`,
    )
    await page.getByTestId('merge-topic-submit').click()
    const response = await accepted
    const admitted: TopicMergeResponseBody = await response.json()
    await expect(page.getByTestId('topic-settings-merge')).toContainText('Merge queued')

    await completeTopicMerge(sourceTopicId, admitted.topic_merge.id)
    await page.getByTestId('topic-settings-merge').getByRole('button').click()
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: 'completed' }),
    ).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/topic/${destSlug}/settings/aliases$`))
  })
})
