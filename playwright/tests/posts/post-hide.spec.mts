import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { insertTestPost } from '../../../backend/test-helpers/index.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let postId: string
let cardSlug = ''
let cardQuery = ''
let feedPostId: string
let feedSlug = ''
let feedQuery = ''
let suffix = ''

test.beforeAll(async () => {
  protectPlaywrightHookTimeouts(test.info())
  suffix = randomSuffix()
  postId = await insertTestPost({
    title: `Post Hide Test ${suffix}`,
    slug: `pw-post-hide-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: 'Post hide feature test content.',
    postType: 'discussion',
  })
  cardQuery = `hidecard${randomSuffix()}`
  cardSlug = `pw-post-hide-card-${cardQuery}`
  feedQuery = `hidefeed${randomSuffix()}`
  feedSlug = `pw-post-hide-feed-${feedQuery}`
  await insertTestPost({
    title: `Post hide card ${cardQuery}`,
    slug: cardSlug,
    createdById: TEST_USER_ID,
    markdown: 'Post hide card visibility fixture.',
    postType: 'discussion',
  })
  feedPostId = await insertTestPost({
    title: `Post hide feed ${feedQuery}`,
    slug: feedSlug,
    createdById: TEST_USER_ID,
    markdown: 'This post should disappear from feed after hiding.',
    postType: 'discussion',
  })
})

test.describe('Post Hide', () => {
  test.use({ storageState: AUTH_STATE })

  test('signed-in user sees Hide button; clicking redirects to home', async ({ page }) => {
    await navigateTo(page, `/discussion/${postId}`)

    const hideButton = page.getByTestId('hide-button')
    await expect(hideButton).toBeVisible()

    await hideButton.click()

    // After hiding, the authenticated home route redirects to the news feed.
    await expect(page).toHaveURL('/feed/news')
  })

  test('card Hide button visible for signed-in users, absent for signed-out', async ({ page }) => {
    const route = `/discussions?sort=new&q=${encodeURIComponent(cardQuery)}`
    const card = page
      .getByTestId('post-card-root')
      .and(page.locator(`[data-post-slug="${cardSlug}"]`))
    await page.context().clearCookies()
    await navigateTo(page, route)
    await expect(card).toBeVisible()
    await expect(card.getByTestId('hide-button')).toHaveCount(0)

    await loginAsTestUser(page)
    await navigateTo(page, route)
    await expect(card.getByTestId('hide-button')).toBeVisible()
  })

  test('hidden post no longer appears in the new posts feed', async ({ page }) => {
    const route = `/discussions?sort=new&q=${encodeURIComponent(feedQuery)}`
    const card = page
      .getByTestId('post-card-root')
      .and(page.locator(`[data-post-slug="${feedSlug}"]`))
    await navigateTo(page, route)
    await expect(card).toBeVisible()

    await navigateTo(page, `/discussion/${feedPostId}`)

    const hideButton = page.getByTestId('hide-button')
    await expect(hideButton).toBeVisible()
    await hideButton.click()

    // Redirected through authenticated home to the news feed.
    await expect(page).toHaveURL('/feed/news')

    await navigateTo(page, route)
    await expect(card).toHaveCount(0)
  })
})
