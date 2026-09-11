import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/entities/communities.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'

/**
 * Community detail page tests.
 * Tests the community header, navigation tabs, and page structure.
 */

let COMMUNITY_SLUG = ''
let COMMUNITY_NAME = ''

const createCommunityFixture = () => {
  const suffix = randomSuffix()
  return {
    slug: `pw-detail-playwright-${suffix}`,
    name: `PW Detail Playwright ${suffix}`,
  }
}

test.describe('Community Detail Page', () => {
  test.beforeAll(async () => {
    const fixture = createCommunityFixture()
    COMMUNITY_NAME = fixture.name
    COMMUNITY_SLUG = fixture.slug

    const community = await insertTestCommunity({
      createdById: TEST_USER_ID,
      name: COMMUNITY_NAME,
      slug: COMMUNITY_SLUG,
    })
    await write(
      `UPDATE communities SET markdown = 'A test community for Playwright.' WHERE id = $1`,
      [community.id],
    )
    await insertTestCommunityMember({
      communityId: community.id,
      role: 'owner',
      userId: TEST_USER_ID,
    })
  })

  test('renders community name as h1', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(COMMUNITY_NAME)
  })

  test('shows member count and post count in header metrics', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-header-metrics')).toBeVisible()
    await expect(page.getByTestId('community-header-metrics')).toContainText(/member/)
    await expect(page.getByTestId('community-header-metrics')).toContainText(/post/)
  })

  test('shows moderators aside', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-moderators-aside')).toBeVisible()
  })

  test('shows Posts as default tab (no Overview tab)', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    // Posts tab links to the community base path
    await expect(page.getByTestId('community-nav-posts')).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY_SLUG}`,
    )
    // No Overview tab
    await expect(page.getByTestId('community-nav-overview')).toBeHidden()
    await expect(page.getByTestId('community-nav-members')).toBeVisible()
  })

  test('root page shows posts feed, not overview', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-overview')).toBeHidden()
  })

  test('Members tab navigates to members page', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await page.getByTestId('community-nav-members').click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}/members`)
  })

  test('about aside shows community description', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-about-aside')).toContainText(
      'A test community for Playwright.',
    )
  })

  test('members page shows member list', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/members`)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })

  test('unauthenticated user can view public community', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(COMMUNITY_NAME)
  })

  test('nonexistent community returns 404', async ({ page }) => {
    const response = await page.goto('/communities/this-community-does-not-exist-xyz')
    expect(response?.status()).toBe(404)
  })

  test('/posts redirects to community index', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/posts`)
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}`)
  })
})
