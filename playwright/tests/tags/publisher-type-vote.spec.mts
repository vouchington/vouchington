import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { addRssFeedTopicPublisherType } from '../../../backend/test-helpers/entities/rss-feeds.mts'
import { beginTransaction } from '../../../backend/data-stores/psql/index.mts'
import { seedPlaywrightPublisherTypeTopics } from '../../../backend/scripts/seeds/playwright-test-data/core-publisher-type-topics.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { getPublisherTypeTopicId } from '../../../backend/services/topics/publisher-type-topics.mts'
import { voteBinaryChoice } from '../../helpers/semantic-vote.mts'

test.describe('Publisher Type vote persistence', () => {
  test.use({ storageState: AUTH_STATE })

  let sourceTopicSlug: string
  let sourceTopicId: string

  test.beforeAll(async () => {
    await using transaction = await beginTransaction()
    await seedPlaywrightPublisherTypeTopics(transaction)
    await transaction.commit()
    const blogPublisherTypeTopicId = await getPublisherTypeTopicId('blog')
    if (!blogPublisherTypeTopicId) {
      throw new Error('Missing seeded blog publisher-type topic')
    }

    const suffix = randomSuffix()
    sourceTopicSlug = `pub-type-vote-${suffix}`
    const { id } = await insertTestTopic(
      `Publisher Type Vote Test ${suffix}`,
      sourceTopicSlug,
      'rss_feed',
    )
    sourceTopicId = id
    // Add a Blog publisher type relation with votes_score_net = 1 so the aside shows it
    // (getEntityRelations uses positiveNetVoteScore: true, i.e. votes_score_net > 0). No vote cast by the test user yet.
    await addRssFeedTopicPublisherType(sourceTopicId, blogPublisherTypeTopicId)
  })

  test('Confirm on publisher type persists after page refresh', async ({ page }) => {
    await navigateTo(page, `/source/${sourceTopicSlug}/latest`)

    const publisherTypeAside = page.getByTestId('publisher-type-aside')
    await expect(publisherTypeAside).toBeVisible()

    const confirmButton = voteBinaryChoice(publisherTypeAside, 'tag-vote', 'confirm')
    await expect(confirmButton).toBeVisible()
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'false')

    // Register the response listener BEFORE the click (required per Playwright CLAUDE.md)
    const voteResponse = page.waitForResponse(
      res =>
        res.url().includes('/api/v1/entity-relations/') &&
        res.url().includes('/vote') &&
        res.request().method() === 'PUT',
    )
    await confirmButton.click()
    await voteResponse

    // Optimistic state: button is now active
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')

    // Reload the page — the fix ensures server-returned election_votes are wired into TagList
    // so Confirm initializes as selected on the fresh render
    await navigateTo(page, `/source/${sourceTopicSlug}/latest`)

    const confirmButtonAfterReload = voteBinaryChoice(
      page.getByTestId('publisher-type-aside'),
      'tag-vote',
      'confirm',
    )
    await expect(confirmButtonAfterReload).toHaveAttribute('aria-pressed', 'true')
  })

  test('source topic publisher type tag management page is available', async ({ page }) => {
    await navigateTo(page, `/source/${sourceTopicSlug}/tags/publisher_type`)

    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Publisher Type')
    await expect(page.getByTestId('publisher-type-select')).toBeVisible()
  })
})
