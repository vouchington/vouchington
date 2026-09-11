import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPost } from '../../../backend/test-helpers/index.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let postId: string
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  postId = await insertTestPost({
    title: `Post Hide Test ${suffix}`,
    slug: `pw-post-hide-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: 'Post hide feature test content.',
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
    await page.context().clearCookies()
    await navigateTo(page, '/discussions')
    await expect(page.getByTestId('hide-button')).toHaveCount(0)

    await loginAsTestUser(page)
    await navigateTo(page, '/discussions')
    await expect(page.getByTestId('hide-button').first()).toBeVisible()
  })

  test('hidden post no longer appears in the new posts feed', async ({ page }) => {
    // Create a dedicated post for feed visibility test
    const feedSuffix = randomSuffix()
    const feedPostId = await insertTestPost({
      title: `Post Hide Feed Test ${feedSuffix}`,
      slug: `pw-post-hide-feed-${feedSuffix}`,
      createdById: TEST_USER_ID,
      markdown: 'This post should disappear from feed after hiding.',
      postType: 'discussion',
    })

    await navigateTo(page, `/discussion/${feedPostId}`)

    const hideButton = page.getByTestId('hide-button')
    await expect(hideButton).toBeVisible()
    await hideButton.click()

    // Redirected through authenticated home to the news feed.
    await expect(page).toHaveURL('/feed/news')

    // Navigate to the new posts feed and verify the hidden post is absent
    await navigateTo(page, '/discussions')

    await expect(
      page
        .getByTestId('post-card-title-link')
        .filter({ hasText: `Post Hide Feed Test ${feedSuffix}` }),
    ).toHaveCount(0)
  })
})
