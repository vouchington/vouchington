import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestCommunity } from '../../../backend/test-helpers/entities/communities.mts'
import { insertTestCommunityListItem } from '../../../backend/test-helpers/entities/community-list-items.mts'
import { insertTestTopic } from '../../../backend/test-helpers/entities/topics.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

/**
 * Communities search with hashtag topic filter tests.
 */

let COMMUNITY_SLUG = ''
let TOPIC_SLUG = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  TOPIC_SLUG = `pw-cs-topic-${suffix}`
  const communitySlug = `pw-cs-community-${suffix}`
  COMMUNITY_SLUG = communitySlug

  const topicId = await insertTestTopic({
    name: `PW CS Topic ${suffix}`,
    slug: TOPIC_SLUG,
    createdById: TEST_USER_ID,
  })

  const community = await insertTestCommunity({
    createdById: TEST_USER_ID,
    name: `PW CS Community ${suffix}`,
    slug: communitySlug,
  })

  await insertTestCommunityListItem({
    communityId: community.id,
    itemType: 'topic',
    entityId: topicId,
  })
})

test.describe('Communities search – hashtag topic filter', () => {
  test('search by #topic updates URL with q=%23 and shows matching community', async ({ page }) => {
    await navigateTo(page, `/communities?q=${encodeURIComponent(`#${TOPIC_SLUG}`)}`)
    await expect(page).toHaveURL(new RegExp('q=%23'))
    await expect(page.getByTestId(`community-card-link-${COMMUNITY_SLUG}`)).toBeVisible()
  })

  test('unknown hashtag topic shows an empty result, not a thrown route error', async ({
    page,
  }) => {
    await navigateTo(page, '/communities?q=%23definitely-unknown-topic-xyzzy-pw')
    // Should remain on /communities, not a 500 error page
    await expect(page).toHaveURL(/\/communities/)
    await expect(page.getByTestId('empty-state')).toBeVisible()
  })

  test('filter row DOM order: input → sort trigger → submit button', async ({ page }) => {
    await navigateTo(page, '/communities')
    await waitForBelowFoldHydration(page)

    const input = page.getByTestId('list-filters-search-input')
    const sortTrigger = page.getByTestId('list-filters-sort-trigger')
    const submitButton = page.getByTestId('list-filters-search-submit')

    await expect(input).toBeVisible()
    await expect(sortTrigger).toBeVisible()
    await expect(submitButton).toBeVisible()

    const controlsInDomOrder = await page.evaluate(() => {
      const controls = [
        document.querySelector('[data-pw="list-filters-search-input"]'),
        document.querySelector('[data-pw="list-filters-sort-trigger"]'),
        document.querySelector('[data-pw="list-filters-search-submit"]'),
      ]
      return controls
        .slice(1)
        .every((control, index) =>
          Boolean(
            controls[index]!.compareDocumentPosition(control!) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        )
    })
    expect(controlsInDomOrder).toBe(true)
  })
})
