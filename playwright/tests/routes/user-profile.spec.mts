import { createTestUser, insertEntityRelation } from '../../../backend/test-helpers/index.mts'
import { updateUserFields } from '../../../backend/services/users/update-fields.mts'
import { expect, test } from '../../helpers/test.mts'
import { loginAsTestUser, TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { userSignalChoice } from '../../helpers/semantic-vote.mts'

// Anonymous by default — most tests assert the logged-out public profile view
// (JSON-LD, public tabs). The two signed-in tests log in explicitly.
test.describe('User profile page', () => {
  let friendsOwnerUsername: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    friendsOwnerUsername = `profile-friends-owner-${suffix}`
    const [owner, following, follower] = await Promise.all([
      createTestUser({ username: friendsOwnerUsername }),
      createTestUser({ username: `profile-friends-following-${suffix}` }),
      createTestUser({ username: `profile-friends-follower-${suffix}` }),
    ])
    if (!owner || !following || !follower) {
      throw new Error('Failed to create profile friends fixture users')
    }

    await Promise.all([
      updateUserFields(owner.id, {
        followers_visibility: 'everyone',
        follows_visibility: 'everyone',
      }),
      insertEntityRelation('relation__user__follow__user', owner.id, following.id),
      insertEntityRelation('relation__user__follow__user', follower.id, owner.id),
    ])
  })

  test('loads by username and shows profile', async ({ page }) => {
    const response = await page.goto(`/user/${TEST_USER_USERNAME}`)
    expect(response?.status()).not.toBe(404)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('user-profile-header')).toBeVisible()
    await expect(page.getByTestId('user-tags-aside')).toHaveCount(0)
    await expect(page.getByTestId('user-vouch-election-card')).toHaveCount(0)
  })

  test('returns 404 for non-existent user', async ({ page }) => {
    const response = await page.goto('/user/definitely-not-a-real-user-xyz')
    expect(response?.status()).toBe(404)
  })

  test('renders ProfilePage JSON-LD structured data', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    const profileSchema = jsonLd
      .map(text => JSON.parse(text))
      .find(schema => schema['@type'] === 'ProfilePage')

    expect(profileSchema).toBeTruthy()
    expect(profileSchema.mainEntity['@type']).toBe('Person')
    expect(profileSchema.url).toContain('/user/')
  })

  test('renders BreadcrumbList JSON-LD structured data', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    const breadcrumbSchema = jsonLd
      .map(text => JSON.parse(text))
      .find(schema => schema['@type'] === 'BreadcrumbList')

    expect(breadcrumbSchema).toBeTruthy()
    expect(breadcrumbSchema.itemListElement).toHaveLength(2)
    expect(breadcrumbSchema.itemListElement[0].name).toBe('Home')
  })

  test('has correct meta tags', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    const title = await page.title()
    expect(title).toContain(TEST_USER_USERNAME)

    const description = page.locator('meta[name="description"]')
    await expect(description).toHaveAttribute('content', /\S/)

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(canonical).toContain('/user/')
  })

  test('shows all six public profile tabs to anonymous users', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    // All 6 tabs are public — no management gate
    await expect(page.getByTestId('user-profile-tab-about')).toBeVisible()
    await expect(page.getByTestId('user-profile-tab-posts')).toBeVisible()
    await expect(page.getByTestId('user-profile-tab-topics')).toBeVisible()
    await expect(page.getByTestId('user-profile-tab-friends')).toBeVisible()
    await expect(page.getByTestId('user-profile-tab-sources')).toBeVisible()
    await expect(page.getByTestId('user-profile-tab-communities')).toBeVisible()
  })

  test('Posts tab dropdown shows sub-navigation and supports navigation', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    // Open the Posts dropdown
    await page.getByTestId('user-profile-tab-posts').click()

    // Sub-pills rendered inside the open dropdown (Radix MenubarContent mounts on open)
    await expect(page.getByTestId('user-profile-subpill-posts-all')).toBeVisible()
    await expect(page.getByTestId('user-profile-subpill-reviews')).toBeVisible()
    await expect(page.getByTestId('user-profile-subpill-discussions')).toBeVisible()

    // Navigate via sub-pill
    await page.getByTestId('user-profile-subpill-discussions').click()
    await expect(page).toHaveURL(new RegExp(`/user/${TEST_USER_USERNAME}/discussions`))
  })

  test('Posts dropdown shows comments sub-pill when on comments route', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}/comments`)

    await page.getByTestId('user-profile-tab-posts').click()
    await expect(page.getByTestId('user-profile-subpill-comments')).toBeVisible()
  })

  test('Friends tab dropdown shows Following and Followed by sub-navigation', async ({ page }) => {
    await navigateTo(page, `/user/${friendsOwnerUsername}`)

    await page.getByTestId('user-profile-tab-friends').click()
    await expect(page.getByTestId('user-profile-subpill-users-following')).toBeVisible()
    await expect(page.getByTestId('user-profile-subpill-users-followers')).toBeVisible()

    await page.getByTestId('user-profile-subpill-users-following').click()
    await expect(page).toHaveURL(new RegExp(`/user/${friendsOwnerUsername}/users/following`))
  })

  test('Sources tab dropdown shows feed-type sub-navigation', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    await page.getByTestId('user-profile-tab-sources').click()
    await expect(page.getByTestId('user-profile-subpill-sources-all')).toBeVisible()
    await expect(page.getByTestId('user-profile-subpill-sources-news')).toBeVisible()
    await expect(page.getByTestId('user-profile-subpill-sources-podcasts')).toBeVisible()
    await expect(page.getByTestId('user-profile-subpill-sources-videos')).toBeVisible()
  })

  test('shows the vouch and user-tags sidebars for signed-in users', async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, '/user/blocked-friend')

    const userTagsSidebar = page.getByRole('complementary')
    const userTagsAside = userTagsSidebar.getByTestId('user-tags-aside')
    await expect(userTagsAside).toBeVisible()
    await expect(userTagsAside.getByRole('button', { name: 'Manage' })).toBeVisible()
    await expect(userTagsSidebar.getByTestId('user-vouch-election-card')).toBeVisible()
    await expect(
      userSignalChoice(userTagsSidebar, 'user-vouch-election-card', 'disavow'),
    ).toBeVisible()
  })
})
