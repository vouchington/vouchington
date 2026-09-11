import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { insertTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let rootPostId: string
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  rootPostId = await insertTestPost({
    title: `Comment Save Root Post ${suffix}`,
    slug: `pw-comment-save-root-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: 'Root post for comment save tests.',
    postType: 'discussion',
  })

  await insertTestPost({
    title: '',
    slug: `pw-comment-save-comment-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: `Comment for save test ${suffix}`,
    postType: 'comment',
    rootId: rootPostId,
    parentId: rootPostId,
  })
})

test.describe('Comment Save', () => {
  test('signed-out user sees no Save button on comment', async ({ page }) => {
    await navigateTo(page, `/discussion/${rootPostId}`)

    await expect(page.getByTestId('comment-save-button')).toHaveCount(0)
  })

  test('signed-in user can save a comment and reload to confirm persistence', async ({ page }) => {
    const user = requireTestValue(
      await createTestUser({ username: `pw-comment-saver-${suffix}` }),
      'Failed to create test user',
    )
    await loginAsUser(page, user.id)
    await navigateTo(page, `/discussion/${rootPostId}`)

    await expect(
      page.getByTestId('comment-node').filter({ hasText: `Comment for save test ${suffix}` }),
    ).toBeVisible()

    const saveButton = page.getByTestId('comment-save-button').first()
    await expect(saveButton).toBeVisible()

    await saveButton.click()

    await expect(saveButton).toHaveAttribute('aria-pressed', 'true')

    // Reload and verify persistence
    await navigateTo(page, `/discussion/${rootPostId}`)
    await expect(
      page.getByTestId('comment-node').filter({ hasText: `Comment for save test ${suffix}` }),
    ).toBeVisible()
    await expect(page.getByTestId('comment-save-button').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
