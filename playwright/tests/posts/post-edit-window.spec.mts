import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Post Edit Window', () => {
  test.use({ storageState: AUTH_STATE })

  test('title and content fields are enabled when editing a fresh post', async ({ page }) => {
    // Establish the worker origin so the relative fetch below resolves — with
    // storageState the page starts at about:blank (no origin for a relative URL).
    await navigateTo(page, '/')
    // Create a fresh post via API (will be within 1-day edit window)
    const postId = await page.evaluate(async () => {
      const response = await fetch('/api/v1/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_type: 'discussion',
          title: 'Edit Window Test Post',
          markdown: 'Content for edit window test',
          broadcast: 'everyone',
          privacy: 'public',
          is_anonymous: false,
          hp_website: '',
          hp_phone: '',
        }),
        credentials: 'include',
      })
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        throw new Error(
          `Failed to create post: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
        )
      }
      const data = await response.json()
      return data.post.id as string
    })

    await navigateTo(page, `/discussion/${postId}/edit`)

    const titleInput = page.getByTestId('post-form-title-input')
    const contentTextarea = page.getByTestId('post-form-content-textarea')

    await expect(titleInput).toBeVisible()
    await expect(contentTextarea).toBeVisible()
    await expect(titleInput).toBeEnabled()
    await expect(contentTextarea).toBeEnabled()

    // Verify info message is NOT present for a fresh post
    await expect(page.getByTestId('post-form-content-locked-notice')).toHaveCount(0)
  })
})
