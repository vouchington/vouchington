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
let originalCommentText = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  originalCommentText = `Original comment text ${suffix}`
  const commentAuthor = await createTestUser({ username: `pw-comment-author-${suffix}` })
  if (!commentAuthor) throw new Error('Failed to create comment author')
  commentAuthorId = commentAuthor.id

  const otherUser = await createTestUser({ username: `pw-comment-edit-other-${suffix}` })
  if (!otherUser) throw new Error('Failed to create other user')
  otherUserId = otherUser.id

  rootPostId = await insertTestPost({
    title: `Comment Edit Root Post ${suffix}`,
    slug: `pw-comment-edit-root-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: 'Root post for comment edit tests.',
    postType: 'discussion',
  })

  await insertTestPost({
    title: '',
    slug: `pw-comment-edit-comment-${suffix}`,
    createdById: commentAuthorId,
    markdown: originalCommentText,
    postType: 'comment',
    rootId: rootPostId,
    parentId: rootPostId,
  })
})

test.describe('Comment Edit', () => {
  test('signed-out user sees no Edit button on comment', async ({ page }) => {
    await navigateTo(page, `/discussion/${rootPostId}`)

    const originalComment = page
      .getByTestId('comment-node')
      .filter({ hasText: originalCommentText })
    await expect(originalComment.getByTestId('comment-node-content')).toBeVisible()
    await expect(page.getByTestId('comment-edit-button')).toHaveCount(0)
  })

  test('comment author sees Edit button; clicking shows edit form; saving shows updated text', async ({
    page,
  }) => {
    await loginAsUser(page, commentAuthorId)
    await navigateTo(page, `/discussion/${rootPostId}`)

    const originalComment = page
      .getByTestId('comment-node')
      .filter({ hasText: originalCommentText })
    await expect(originalComment.getByTestId('comment-node-content')).toBeVisible()

    const editButton = page.getByTestId('comment-edit-button').first()
    await expect(editButton).toBeVisible()

    await editButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await editButton.click()

    const editForm = page.getByTestId('comment-edit-form')
    await expect(editForm).toBeVisible()

    const updatedText = `Updated comment text ${suffix}`
    const textarea = editForm.getByTestId('comment-edit-textarea')
    await textarea.fill('')
    await textarea.pressSequentially(updatedText)

    await editForm.getByTestId('comment-edit-save-button').click()

    await expect(
      page.getByTestId('comment-node').filter({ hasText: updatedText }).first(),
    ).toBeVisible()
    await expect(page.getByTestId('comment-edit-form')).toHaveCount(0)
  })

  test('non-author sees no Edit button on comment', async ({ page }) => {
    await loginAsUser(page, otherUserId)
    await navigateTo(page, `/discussion/${rootPostId}`)

    await expect(page.getByTestId('comment-edit-button')).toHaveCount(0)
  })
})
