import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  followRssFeed,
  insertTestCommunityMember,
  insertTestCommunityListItem,
} from '../../../backend/test-helpers/index.mts'

// Seeded RSS feed that has items visible on /news and /communities/:slug/news.
// Source: backend/scripts/seeds/playwright-test-data/feeds.mts
const SEEDED_RSS_FEED_ID = '019c64e6-f8c0-7000-8000-000000000001'

// Seeded community used across Playwright coverage tests.
// Source: backend/scripts/seeds/playwright-test-data/core-memberships-and-communities.mts
const PLAYWRIGHT_COMMUNITY_ID = '019c0000-0000-7000-8000-000000000010'
const PLAYWRIGHT_COMMUNITY_SLUG = 'playwright-popular-community'

let userId: string

test.beforeEach(async () => {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noUsername: true })
  if (!user) throw new Error('Failed to create test user')
  userId = user.id
  await followRssFeed(user, SEEDED_RSS_FEED_ID)
})

test.describe('Discuss — IDENTITY_REQUIRED gate (global)', () => {
  test('shows username dialog instead of error toast when clicking global Discuss without a username', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/news')

    // The fresh user has no existing global posts so the single-action button
    // fires handleStartDiscussion directly on click (no dropdown step needed).
    await page.getByTestId('news-discuss-button').first().click()

    // Username dialog must appear — not an error toast
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()
  })

  test('setting a username via the dialog retries and navigates to the created post', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/news')

    await page.getByTestId('news-discuss-button').first().click()
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    const username = `disc-id-${randomSuffix()}`
    await page.getByTestId('username-required-dialog-input').pressSequentially(username)
    await page.getByTestId('username-required-dialog-submit').click()

    // After username is set the retry fires and navigates to the new post
    await page.waitForURL(/\/(link|discussion|story)\//)
  })

  test('dismissing the username dialog re-enables the Discuss button', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/news')

    await page.getByTestId('news-discuss-button').first().click()
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    await page.getByTestId('username-required-dialog-cancel').click()

    // Dialog dismissed — the Discuss button must be re-enabled
    await expect(page.getByTestId('news-discuss-button').first()).toBeEnabled()
  })
})

test.describe('Discuss — IDENTITY_REQUIRED gate (community)', () => {
  test.beforeAll(async () => {
    // Link the seeded RSS feed to the community. Idempotent: on retry Playwright
    // re-runs beforeAll, which would hit the unique constraint — ignore it (23505).
    try {
      await insertTestCommunityListItem({
        communityId: PLAYWRIGHT_COMMUNITY_ID,
        itemType: 'rss_feed',
        entityId: SEEDED_RSS_FEED_ID,
      })
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== '23505') throw error
    }
  })

  test.beforeEach(async () => {
    // Seed community membership for the per-test fresh user
    await insertTestCommunityMember({ communityId: PLAYWRIGHT_COMMUNITY_ID, userId })
  })

  test('shows username dialog instead of error toast when clicking community Discuss without a username', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, `/communities/${PLAYWRIGHT_COMMUNITY_SLUG}/news`)

    // Open the NewsDiscussMenu dropdown on the first eligible card
    await page.getByTestId('news-discuss-button').first().click()

    // Dropdown shows both the global Discuss create item and the community item
    await expect(page.getByTestId('news-discuss-create-item').first()).toBeVisible()

    // Click "Discuss in <community>" which opens NewsCommunityDiscussionDialog
    await page.getByTestId('news-community-discuss-menu-item').first().click()

    // Wait for Turnstile stub token and submit
    await expect(page.getByRole('button', { name: 'Start discussion' })).toBeEnabled()
    await page.getByRole('button', { name: 'Start discussion' }).click()

    // Username dialog must appear — not an error toast
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()
  })

  test('setting a username via the dialog retries community post and navigates', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, `/communities/${PLAYWRIGHT_COMMUNITY_SLUG}/news`)

    await page.getByTestId('news-discuss-button').first().click()
    await page.getByTestId('news-community-discuss-menu-item').first().click()

    await expect(page.getByRole('button', { name: 'Start discussion' })).toBeEnabled()
    await page.getByRole('button', { name: 'Start discussion' }).click()

    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    const username = `comm-disc-id-${randomSuffix()}`
    await page.getByTestId('username-required-dialog-input').pressSequentially(username)
    await page.getByTestId('username-required-dialog-submit').click()

    // After username is set the retry fires and navigates to the new community post or pending page
    await page.waitForURL(/\/(discussion|communities\/[^/]+\/(posts|pending))/)
  })
})
