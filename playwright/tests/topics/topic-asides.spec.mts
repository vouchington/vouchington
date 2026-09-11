import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../../backend/test-helpers/entities/topics.mts'
import { insertTestCommunity } from '../../../backend/test-helpers/entities/communities.mts'
import { insertTestCommunityListItem } from '../../../backend/test-helpers/entities/community-list-items.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

/**
 * Topic aside tests — TopicCommunitiesAside
 */

let topicId: string
let topicSlug: string

test.beforeAll(async () => {
  const suffix = randomSuffix()
  topicSlug = `pw-ta-topic-${suffix}`
  const communitySlug = `pw-ta-community-${suffix}`

  topicId = await insertTestTopic({
    name: `PW TA Topic ${suffix}`,
    slug: topicSlug,
    createdById: TEST_USER_ID,
  })

  const community = await insertTestCommunity({
    createdById: TEST_USER_ID,
    name: `PW TA Community ${suffix}`,
    slug: communitySlug,
  })

  await insertTestCommunityListItem({
    communityId: community.id,
    itemType: 'topic',
    entityId: topicId,
  })
})

test.describe('TopicCommunitiesAside', () => {
  test('shows communities aside when a topic has communities', async ({ page }) => {
    await navigateTo(page, `/topic/${topicId}/posts`)

    await expect(page.getByTestId('topic-communities-aside')).toBeVisible()
  })

  test('See all link has correct href using topic slug', async ({ page }) => {
    await navigateTo(page, `/topic/${topicId}/posts`)

    const seeAll = page.getByTestId('topic-communities-aside-see-all')
    await expect(seeAll).toBeVisible()
    await expect(seeAll).toHaveAttribute('href', `/communities?q=%23${topicSlug}`)
  })
})
