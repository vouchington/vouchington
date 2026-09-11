import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/entities/communities.mts'
import { insertTestCommunityPostReview } from '../../../backend/test-helpers/entities/community-post-reviews.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

let COMMUNITY_SLUG = ''

const createCommunityFixture = () => {
  const suffix = randomSuffix()
  return {
    slug: `pw-pinned-posts-playwright-${suffix}`,
    name: `PW Pinned Posts Playwright ${suffix}`,
  }
}

test.describe('Community Pinned Posts', () => {
  test.use({ storageState: AUTH_STATE })

  let postId: string

  test.beforeAll(async () => {
    const fixture = createCommunityFixture()
    COMMUNITY_SLUG = fixture.slug

    const community = await insertTestCommunity({
      createdById: TEST_USER_ID,
      name: fixture.name,
      slug: COMMUNITY_SLUG,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      role: 'owner',
      userId: TEST_USER_ID,
    })

    postId = await insertTestPost({
      communityId: community.id,
      createdById: TEST_USER_ID,
      markdown: 'This post is pinned.',
      slug: `pinned-test-post-${randomSuffix()}`,
      title: 'Pinned Test Post',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: TEST_USER_ID,
    })
    await write(
      `/* community-pinned-posts-spec pinPost */
      INSERT INTO community_pinned_posts (community_id, post_id, order_index, pinned_by_id)
      VALUES ($1, $2, 0, $3)`,
      [community.id, postId, TEST_USER_ID],
    )
  })

  test('shows pinned posts section at top of feed', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    // Pinned post section should be visible
    await expect(page.getByTestId('community-feed-pinned-badge').first()).toBeVisible()
  })

  test('settings pinned-posts page accessible to moderators', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/pinned-posts`)
    await expect(page.getByTestId('pinned-posts-page-heading')).toBeVisible()
  })
})
