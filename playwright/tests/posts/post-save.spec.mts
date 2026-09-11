import { test, expect, type Page } from '../../helpers/test.mts'
import { loginAsTestUser, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { insertTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let postId: string
let suffix = ''

function waitForPostSaveResponse(page: Page) {
  return page.waitForResponse(
    response =>
      response.url().includes(`/api/v1/bookmarks/post/${postId}/save`) && response.status() < 400,
  )
}

test.beforeAll(async () => {
  suffix = randomSuffix()
  postId = await insertTestPost({
    title: `Post Save Test ${suffix}`,
    slug: `pw-post-save-${suffix}`,
    createdById: TEST_USER_ID,
    markdown: 'Post save feature test content.',
    postType: 'discussion',
  })
})

test.describe('Post Save', () => {
  test('signed-out user sees no Save button on post card or post detail', async ({ page }) => {
    await navigateTo(page, `/discussion/${postId}`)

    await expect(page.getByTestId('post-save-button')).toHaveCount(0)
  })

  test('signed-in user can save a post and reload to confirm persistence', async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, `/discussion/${postId}`)

    const saveButton = page.getByTestId('post-save-button')
    await expect(saveButton).toBeVisible()

    const savePromise = waitForPostSaveResponse(page)
    await saveButton.click()
    await savePromise

    // Button should reflect active/saved state
    await expect(saveButton).toHaveAttribute('aria-pressed', 'true')

    // Reload and verify persistence
    await navigateTo(page, `/discussion/${postId}`)
    await expect(page.getByTestId('post-save-button')).toHaveAttribute('aria-pressed', 'true')
  })

  test('card Save button visible for signed-in users, absent for signed-out', async ({ page }) => {
    await navigateTo(page, '/discussions')
    await expect(page.getByTestId('post-card-save-button')).toHaveCount(0)

    await loginAsTestUser(page)
    await navigateTo(page, '/discussions')
    await expect(page.getByTestId('post-card-save-button').first()).toBeVisible()
  })

  test('signed-in user can unsave a post and reload to confirm inactive', async ({ page }) => {
    const user = requireTestValue(
      await createTestUser({ username: `pw-unsave-${suffix}` }),
      'Failed to create test user',
    )
    await loginAsUser(page, user.id)
    await navigateTo(page, `/discussion/${postId}`)

    const saveButton = page.getByTestId('post-save-button')
    await expect(saveButton).toBeVisible()

    // Save first
    const savePromise = waitForPostSaveResponse(page)
    await saveButton.click()
    await savePromise
    await expect(saveButton).toHaveAttribute('aria-pressed', 'true')

    // Unsave
    const unsavePromise = waitForPostSaveResponse(page)
    await saveButton.click()
    await unsavePromise
    await expect(saveButton).toHaveAttribute('aria-pressed', 'false')

    // Reload and verify inactive
    await navigateTo(page, `/discussion/${postId}`)
    await expect(page.getByTestId('post-save-button')).toHaveAttribute('aria-pressed', 'false')
  })
})
