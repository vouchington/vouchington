import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestCommunityPostReview,
} from '../../../backend/test-helpers/index.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

/**
 * Tests for community feature improvements:
 * - Default Posts tab (no Overview tab)
 * - Metrics in community header
 * - Moderation dropdown
 * - Pin to community from post overflow
 * - Sidebar update on create
 */

let COMMUNITY_SLUG = ''
let POST_ID = ''

test.describe('Community features', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    COMMUNITY_SLUG = `pw-community-features-${suffix}`

    const community = await insertTestCommunity({
      createdById: TEST_USER_ID,
      name: `PW Community Features ${suffix}`,
      slug: COMMUNITY_SLUG,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      role: 'owner',
      userId: TEST_USER_ID,
    })

    POST_ID = await insertTestPost({
      communityId: community.id,
      createdById: TEST_USER_ID,
      title: `PW Features Post ${suffix}`,
      markdown: 'Test post for community features.',
      slug: `pw-features-post-${suffix}`,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: POST_ID,
      submittedById: TEST_USER_ID,
    })
  })

  test('community index shows posts feed (not overview)', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    // Posts tab is active at the base path
    await expect(page.getByTestId('community-nav-posts')).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY_SLUG}`,
    )
    // No Overview tab
    await expect(page.getByTestId('community-nav-overview')).toBeHidden()
  })

  test('community header shows member and post metrics', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-header-metrics')).toBeVisible()
    await expect(page.getByTestId('community-header-metrics')).toContainText(/member/)
    await expect(page.getByTestId('community-header-metrics')).toContainText(/post/)
  })

  test('Moderation tab is a dropdown with Reports, Mod Log, Analytics, Pinned Posts items', async ({
    page,
  }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/settings/moderation`)
    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    // The Moderation tab should render as a dropdown trigger (span, not link)
    await expect(page.getByTestId('community-nav-moderation')).toBeVisible()
    // Open the dropdown
    await page.getByTestId('community-nav-moderation').click()
    await expect(page.getByTestId('community-nav-moderation-reports')).toBeVisible()
    await expect(page.getByTestId('community-nav-modlog')).toBeVisible()
    await expect(page.getByTestId('community-nav-moderation-analytics')).toBeVisible()
    await expect(page.getByTestId('community-nav-pinned-posts')).toBeVisible()
  })

  test('pin to community action appears in post overflow for community mod', async ({ page }) => {
    await navigateTo(page, `/discussion/${POST_ID}`)
    await page.getByTestId('post-detail-overflow-trigger').click()
    await expect(page.getByTestId('pin-community-post-menu-item')).toBeVisible()
  })

  test('pinning a post marks it as pinned in the community feed', async ({ page }) => {
    await navigateTo(page, `/discussion/${POST_ID}`)
    await page.getByTestId('post-detail-overflow-trigger').click()
    const pinItem = page.getByTestId('pin-community-post-menu-item')
    await expect(pinItem).toBeVisible()

    // Register before click so the PUT response is captured even if it arrives quickly
    const pinnedResponse = page.waitForResponse(
      resp => resp.url().includes('/pinned-posts') && resp.request().method() === 'PUT',
    )
    await pinItem.click()
    await pinnedResponse

    // Navigate to community feed and confirm pinned badge
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-feed-pinned-badge').first()).toBeVisible()

    // Unpin for cleanup — navigate back to post
    await navigateTo(page, `/discussion/${POST_ID}`)
    await page.getByTestId('post-detail-overflow-trigger').click()
    const unpinResponse = page.waitForResponse(
      resp => resp.url().includes('/pinned-posts') && resp.request().method() === 'PUT',
    )
    await page.getByTestId('unpin-community-post-menu-item').click()
    await unpinResponse
  })

  test('sidebar shows newly created community without page reload', async ({ page }) => {
    await navigateTo(page, '/communities/create')

    const suffix = randomSuffix()
    const name = `PW Sidebar Update ${suffix}`
    const slug = `pw-sidebar-update-${suffix}`

    await page.getByTestId('create-community-name-input').pressSequentially(name)
    await page.getByTestId('create-community-slug-input').pressSequentially(slug)

    const createResponse = page.waitForResponse(
      resp => resp.url().includes('/api/v1/communities') && resp.request().method() === 'POST',
    )
    await page.getByTestId('create-community-submit-button').click()
    await createResponse

    // After redirect to new community, sidebar should show the community
    await page.waitForURL(`/communities/${slug}`)
    await expect(page.getByTestId('sidebar-group-my-communities')).toBeVisible()
    await expect(page.getByTestId('sidebar-group-my-communities').getByText(name)).toBeVisible()
  })
})

test.describe('Community pinned-posts page accessible via Moderation dropdown', () => {
  test.use({ storageState: AUTH_STATE })

  let slug = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    slug = `pw-pinned-dropdown-${suffix}`
    const community = await insertTestCommunity({
      createdById: TEST_USER_ID,
      name: `PW Pinned Dropdown ${suffix}`,
      slug,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      role: 'owner',
      userId: TEST_USER_ID,
    })
  })

  test('pinned posts page accessible via Moderation > Pinned Posts', async ({ page }) => {
    await navigateTo(page, `/communities/${slug}/settings/pinned-posts`)
    await expect(page.getByTestId('pinned-posts-page-heading')).toBeVisible()
  })
})

test.describe('Community moderation page resilience', () => {
  test.use({ storageState: AUTH_STATE })

  let slug = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    slug = `pw-mod-resilience-${suffix}`
    const community = await insertTestCommunity({
      createdById: TEST_USER_ID,
      name: `PW Mod Resilience ${suffix}`,
      slug,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      role: 'owner',
      userId: TEST_USER_ID,
    })
  })

  test('moderation page loads and shows heading', async ({ page }) => {
    await navigateTo(page, `/communities/${slug}/settings/moderation`)
    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
  })
})
