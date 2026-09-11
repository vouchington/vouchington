import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { voteTrigger } from '../../helpers/semantic-vote.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  insertTestPost,
  createTestUser,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Uses seed data:
// - Discussion: '019c64e6-f720-7001-a001-000000000001'
// - Comment A: '019c64e6-f730-7001-8001-000000000001' (top-level)
// - Reply B: '019c64e6-f730-7001-8001-000000000002' (child of A)
// - Reply D: '019c64e6-f730-7001-8001-000000000003' (child of B, depth 3)
// - Reply C: '019c64e6-f730-7001-8001-000000000004' (child of A)

const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'
const COMMENT_A_ID = '019c64e6-f730-7001-8001-000000000001'
const REPLY_B_ID = '019c64e6-f730-7001-8001-000000000002'

test.describe('Comments', () => {
  test.use({ storageState: AUTH_STATE })

  let contributorId: string

  test.beforeAll(async () => {
    const contributor = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      'Failed to create comments contributor',
    )
    contributorId = contributor.id
  })

  test('comment tree renders on discussion page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Comments section should appear
    await expect(page.getByTestId('comments-heading')).toBeVisible()

    // Seeded comments should be visible
    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()
    await expect(commentBodies.filter({ hasText: 'This is Reply B' })).toBeVisible()
    await expect(commentBodies.filter({ hasText: 'This is Reply D' })).toBeVisible()
    await expect(commentBodies.filter({ hasText: 'This is Reply C' })).toBeVisible()
  })

  test('comment collapse hides children', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Wait for comments to load
    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()
    await waitForBelowFoldHydration(page)

    const commentA = page
      .getByTestId('comment-node')
      .filter({
        has: page.getByTestId('comment-node-content').filter({ hasText: 'This is Comment A' }),
      })
      .first()
    await commentA.getByTestId('comment-collapse-button').first().click()

    // Children should be hidden
    await expect(commentBodies.filter({ hasText: 'This is Reply B' })).toBeHidden()
    await expect(commentBodies.filter({ hasText: 'This is Reply C' })).toBeHidden()

    // Collapsing Comment A hides its own content too, not just its children — only the
    // header (author, collapse toggle) stays mounted; see CommentNode's `!isCollapsed` guard.
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeHidden()
  })

  test('empty state shows reply form', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // The "What are your thoughts?" placeholder should appear in a textarea
    await expect(page.getByTestId('root-comment-textarea')).toBeVisible()
  })

  test('comment reply form appears when authenticated and Reply clicked', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Wait for comments to load
    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()

    // Click Reply on the first comment
    const replyButton = page.getByTestId('comment-reply-button').first()
    await replyButton.click()

    // Reply form should appear
    await expect(page.getByTestId('comment-reply-textarea')).toBeVisible()
    await expect(page.getByTestId('comment-reply-cancel')).toBeVisible()
  })

  test('cancel button hides reply form', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()

    // Open reply form
    const replyButton = page.getByTestId('comment-reply-button').first()
    await replyButton.click()
    await expect(page.getByTestId('comment-reply-textarea')).toBeVisible()

    // Cancel
    await page.getByTestId('comment-reply-cancel').click()
    await expect(page.getByTestId('comment-reply-textarea')).toBeHidden()
  })

  test('sort controls switch between New and Best', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    await expect(page.getByTestId('comments-heading')).toBeVisible()

    const sortSelect = page.getByTestId('comments-sort-trigger')
    await expect(sortSelect).toBeVisible()
    await sortSelect.click()
    await expect(page.getByTestId('comments-sort-option-best')).toBeVisible()
    await expect(page.getByTestId('comments-sort-option-new')).toBeVisible()

    // Switch to New sort
    await page.getByTestId('comments-sort-option-new').click()

    // Page should still show comments
    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()
  })

  test('comment permalink page shows ancestors and descendants', async ({ page }) => {
    // Navigate to Reply B's permalink (it has Comment A as ancestor and Reply D as descendant)
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/comment/${REPLY_B_ID}`)

    // Should show the root discussion link (exclude breadcrumb nav)
    await expect(page.locator('main').getByTestId('comment-permalink-root-link')).toBeVisible()

    // Should show Reply D as descendant
    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Reply D' })).toBeVisible()
  })

  test('permalink link navigates to comment page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Wait for Comment A to load
    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()

    const commentA = page
      .getByTestId('comment-node')
      .filter({
        has: page.getByTestId('comment-node-content').filter({ hasText: 'This is Comment A' }),
      })
      .first()
    await commentA.getByTestId('comment-permalink-link').first().click()

    // Should navigate to the comment permalink page
    await expect(page).toHaveURL(`/discussion/${DISCUSSION_ID}/comment/${COMMENT_A_ID}`)
  })

  test('vote buttons render on comments', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()

    await expect(voteTrigger(page, 'comment-vote').first()).toBeVisible()
  })

  test('username on a comment links to user profile', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()

    // Seeded comments are authored by 'tests' — click the first user-link
    const usernameLink = page.getByTestId('user-link').first()
    await expect(usernameLink).toBeVisible()
    await usernameLink.click()

    await expect(page).toHaveURL(/\/user\/[^/]+\/comments/)
  })

  test('clicking the metadata row collapses the comment thread', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()
    await waitForBelowFoldHydration(page)

    // Click the full-row metadata collapse target, not the chevron button or a link.
    const commentA = page
      .getByTestId('comment-node')
      .filter({
        has: page.getByTestId('comment-node-content').filter({ hasText: 'This is Comment A' }),
      })
      .first()
    await commentA.getByLabel('Collapse comment metadata row').first().click()

    await expect(commentBodies.filter({ hasText: 'This is Reply B' })).toBeHidden()
    await expect(commentBodies.filter({ hasText: 'This is Reply C' })).toBeHidden()
  })

  test('collapse state persists after page reload', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()
    await waitForBelowFoldHydration(page)

    const commentA = page
      .getByTestId('comment-node')
      .filter({
        has: page.getByTestId('comment-node-content').filter({ hasText: 'This is Comment A' }),
      })
      .first()
    await commentA.getByTestId('comment-collapse-button').first().click()

    await expect(commentBodies.filter({ hasText: 'This is Reply B' })).toBeHidden()

    // Reload the page
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Comment A's children should still be hidden
    await expect(commentBodies.filter({ hasText: 'This is Reply B' })).toBeHidden()
  })

  test('new reply renders markdown HTML immediately without reload', async ({ page }) => {
    const suffix = randomSuffix()
    const replyText = `bold test reply ${suffix}`
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    const commentBodies = page.getByTestId('comment-node-content')
    await expect(commentBodies.filter({ hasText: 'This is Comment A' })).toBeVisible()

    // Type markdown bold text into the root reply textarea
    const textarea = page.getByTestId('root-comment-textarea')
    await textarea.pressSequentially(`**${replyText}**`)

    const submitButton = page.getByTestId('comment-reply-submit').first()
    await submitButton.click()

    // The new comment should appear with rendered HTML (a <strong> element), not raw markdown
    await expect(page.locator('strong').filter({ hasText: replyText })).toBeVisible()
  })

  test('unauthenticated user sees sign in prompt', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Sign in to comment link should appear in the top-level reply area
    await expect(page.getByTestId('comment-sign-in-link')).toBeVisible()
  })

  test('comment form is always shown even on posts with no comments', async ({ page }) => {
    // Create a fresh post with no comments
    const unique = randomSuffix()
    const user = requireTestValue(
      await createTestUser({ username: `pw-nocomments-${unique}` }),
      'Failed to create test user',
    )
    const postId = await insertTestPost({
      title: `No Comments Post ${unique}`,
      slug: `pw-nocomments-${unique}`,
      createdById: user.id,
      markdown: 'This post has no comments yet.',
      postType: 'discussion',
    })

    await navigateTo(page, `/discussion/${postId}`)

    // Comments section heading should appear
    await expect(page.locator('main').getByTestId('comments-heading')).toBeVisible()

    // Comment form should be visible even with no comments
    await expect(page.getByTestId('root-comment-textarea')).toBeVisible()
  })
})
