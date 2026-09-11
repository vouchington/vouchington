import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let otherUserId: string
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  const otherUser = await createTestUser({ username: `pw-del-other-${suffix}` })
  if (!otherUser) throw new Error('Failed to create other test user')
  otherUserId = otherUser.id
})

test.describe('Post Delete', () => {
  test('signed-out user sees no Delete button', async ({ page }) => {
    const postId = await insertTestPost({
      title: `Post Delete Signed Out ${suffix}`,
      slug: `pw-post-del-anon-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Post delete signed-out test.',
      postType: 'discussion',
    })

    await navigateTo(page, `/discussion/${postId}`)

    await expect(page.getByTestId('post-delete-trigger')).toHaveCount(0)
  })

  test('signed-in non-owner sees no Delete button', async ({ page }) => {
    const postId = await insertTestPost({
      title: `Post Delete Non-Owner ${suffix}`,
      slug: `pw-post-del-nonowner-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Post delete non-owner test.',
      postType: 'discussion',
    })

    await loginAsUser(page, otherUserId)
    await navigateTo(page, `/discussion/${postId}`)

    await expect(page.getByTestId('post-delete-trigger')).toHaveCount(0)
  })

  test('signed-in owner can open delete dialog, confirm, and is redirected away', async ({
    page,
  }) => {
    const deleteSuffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Post Delete Owner ${deleteSuffix}`,
      slug: `pw-post-del-owner-${deleteSuffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Post delete owner test.',
      postType: 'discussion',
    })

    await loginAsTestUser(page)
    await navigateTo(page, `/discussion/${postId}`)

    // Open the overflow kebab to reveal the delete trigger
    await page.getByTestId('post-detail-overflow-trigger').click()

    const deleteButton = page.getByTestId('post-delete-trigger')
    await expect(deleteButton).toBeVisible()

    await deleteButton.click()

    // Dialog should open
    await expect(page.getByRole('alertdialog')).toBeVisible()

    // Confirm deletion
    await page.getByTestId('post-delete-confirm').click()

    // Should redirect away from the post
    await expect(page).not.toHaveURL(`/discussion/${postId}`)
  })
})
