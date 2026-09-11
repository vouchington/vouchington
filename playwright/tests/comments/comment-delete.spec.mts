import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { insertTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let rootPostId: string
let commentAuthorId: string
let otherUserId: string
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  const commentAuthor = await createTestUser({ username: `pw-comment-del-author-${suffix}` })
  if (!commentAuthor) throw new Error('Failed to create comment author')
  commentAuthorId = commentAuthor.id

  const otherUser = await createTestUser({ username: `pw-comment-del-other-${suffix}` })
  if (!otherUser) throw new Error('Failed to create other user')
  otherUserId = otherUser.id

  rootPostId = await insertTestPost({
    title: `Comment Delete Root Post ${suffix}`,
    slug: `pw-comment-delete-root-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: 'Root post for comment delete tests.',
    postType: 'discussion',
  })
})

test.describe('Comment Delete', () => {
  test('signed-out user sees no Delete button on comment', async ({ page }) => {
    const anonCommentText = `Comment for anon delete test ${suffix}`
    await insertTestPost({
      title: '',
      slug: `pw-comment-del-anon-${suffix}`,
      createdById: commentAuthorId,
      markdown: anonCommentText,
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })

    await navigateTo(page, `/discussion/${rootPostId}`)

    const comment = page.getByTestId('comment-node').filter({ hasText: anonCommentText })
    await expect(comment.getByTestId('comment-node-content')).toBeVisible()
    await expect(page.getByTestId('delete-comment-button')).toHaveCount(0)
  })

  test('non-author sees no Delete button on comment', async ({ page }) => {
    const nonAuthorCommentText = `Comment for non-author delete test ${suffix}`
    await insertTestPost({
      title: '',
      slug: `pw-comment-del-nonauth-${suffix}`,
      createdById: commentAuthorId,
      markdown: nonAuthorCommentText,
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })

    await loginAsUser(page, otherUserId)
    await navigateTo(page, `/discussion/${rootPostId}`)

    const comment = page.getByTestId('comment-node').filter({ hasText: nonAuthorCommentText })
    await expect(comment.getByTestId('comment-node-content')).toBeVisible()
    await expect(page.getByTestId('delete-comment-button')).toHaveCount(0)
  })

  test('comment author can delete comment; [deleted] placeholder shown', async ({ page }) => {
    const deleteSuffix = randomSuffix()
    const commentMarkdown = `Comment to delete ${deleteSuffix}`
    await insertTestPost({
      title: '',
      slug: `pw-comment-del-author-${deleteSuffix}`,
      createdById: commentAuthorId,
      markdown: commentMarkdown,
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })

    await loginAsUser(page, commentAuthorId)
    await navigateTo(page, `/discussion/${rootPostId}`)

    const targetComment = page.getByTestId('comment-node').filter({ hasText: commentMarkdown })
    await expect(targetComment.getByTestId('comment-node-content')).toBeVisible()

    // Scope to the specific comment-node containing our text, not the first delete button globally
    const deleteButton = targetComment.getByTestId('delete-comment-button')
    await expect(deleteButton).toBeVisible()

    // Scroll into view so React bumps hydration priority for this below-fold component
    await deleteButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await deleteButton.click()

    // Confirm dialog should appear
    await expect(page.getByRole('alertdialog')).toBeVisible()

    // Confirm deletion
    await page.getByTestId('comment-delete-confirm-button').click()

    // The comment text should be replaced with a [deleted] placeholder (multiple [deleted] elements may appear)
    await expect(page.getByTestId('comment-deleted-placeholder').first()).toBeVisible()
    await expect(page.getByTestId('comment-node').filter({ hasText: commentMarkdown })).toHaveCount(
      0,
    )
  })
})
