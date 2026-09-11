import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPost } from '../../../backend/test-helpers/index.mts'

// Uses seed data:
// - Test user: '019f0000-0000-7000-8000-000000000000'
// - Discussion 4: '019c64e6-f720-7001-a001-000000000004' (no tags — safe for mutation tests)
// - URL: '019c64e6-2000-7000-8000-000000000003' → 'https://test.org/article' (404 crawl, no title — renders as 'test.org/article')

const DISCUSSION_4_ID = '019c64e6-f720-7001-a001-000000000004'
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Related Links (URL tags) Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows Related Links management page when authenticated', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_4_ID}/tags/url`)

    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Related Links')
    await expect(page.getByTestId('manage-tags-current-heading')).toContainText('Related Links')
  })

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/discussion/${DISCUSSION_4_ID}/tags/url`)
    await expect(page).toHaveURL('/login')
  })

  test('shows min-length hint when query is too short', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_4_ID}/tags/url`)

    const searchInput = page.getByTestId('tag-autocomplete-input-url')
    await searchInput.pressSequentially('ex')

    await expect(page.getByTestId('entity-autocomplete-empty')).toContainText(
      /Type at least \d+ characters to search/i,
    )
  })

  test('auto-submits on URL selection and adds to current tags', async ({ page }) => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `URL tag mutation discussion ${suffix}`,
      slug: `url-tag-mutation-discussion-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'A fresh discussion for URL tag mutation.',
      postType: 'discussion',
    })
    await navigateTo(page, `/discussion/${postId}/tags/url`)

    const currentTagsSection = page.getByTestId('manage-tags-current-section')
    await expect(currentTagsSection).toBeVisible()

    const searchInput = page.getByTestId('tag-autocomplete-input-url')
    await searchInput.pressSequentially('test.org/article')

    const option = page.getByTestId('tag-autocomplete-item-url').first()
    await expect(option).toBeVisible()
    await option.click()

    await expect(
      currentTagsSection
        .getByTestId('url-embed-row')
        .filter({ hasText: 'test.org/article' })
        .first(),
    ).toBeVisible()
  })
})
