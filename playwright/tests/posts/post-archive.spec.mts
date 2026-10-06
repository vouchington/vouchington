import { test, expect, type Page } from '../../helpers/test.mts'
import { loginAsAdmin, loginAsTestUser, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  getPostArchivedFields,
  insertTestPost,
} from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

function waitForArchiveResponse(page: Page, postId: string, slug: string, archive: boolean) {
  const archived = archive ? 'true' : 'false'
  return page.waitForResponse(response => {
    if (response.request().method() !== 'PATCH' || response.status() >= 400) return false
    const pathname = new URL(response.url()).pathname
    const matchesPost =
      pathname === `/api/v1/posts/${encodeURIComponent(postId)}` ||
      pathname === `/api/v1/posts/${encodeURIComponent(slug)}`
    if (!matchesPost) return false
    return (response.request().postData() ?? '').includes(`"archive":${archived}`)
  })
}

test.describe('Post Archive', () => {
  test('owner can archive and unarchive from the edit page Advanced section', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Post Archive Owner ${suffix}`
    const slug = `pw-post-archive-owner-${suffix}`
    const postId = await insertTestPost({
      title,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post archive owner test.',
      postType: 'discussion',
    })

    await loginAsTestUser(page)
    await navigateTo(page, `/discussion/${postId}/edit`)

    await page.getByTestId('post-form-advanced-toggle').click()
    const archiveButton = page.getByTestId('post-archive-button')
    await expect(archiveButton).toBeVisible()
    await expect(archiveButton).toHaveText('Archive')

    const archiveResponse = waitForArchiveResponse(page, postId, slug, true)
    await archiveButton.click()
    await archiveResponse
    await expect(archiveButton).toHaveText('Unarchive')
    expect((await getPostArchivedFields(postId))?.archived_at).not.toBeNull()

    await navigateTo(page, `/discussion/${postId}`)
    await expect(page.getByTestId('post-detail-heading')).toContainText(title)

    await navigateTo(page, '/discussions')
    await expect(page.getByTestId('post-card-title-link').filter({ hasText: title })).toHaveCount(0)

    await navigateTo(page, `/discussion/${postId}/edit`)
    await page.getByTestId('post-form-advanced-toggle').click()
    const unarchiveButton = page.getByTestId('post-archive-button')
    await expect(unarchiveButton).toHaveText('Unarchive')

    const unarchiveResponse = waitForArchiveResponse(page, postId, slug, false)
    await unarchiveButton.click()
    await unarchiveResponse
    await expect(unarchiveButton).toHaveText('Archive')
    expect((await getPostArchivedFields(postId))?.archived_at).toBeNull()
  })

  test("admin can archive another user's post from the edit page", async ({ page }) => {
    const suffix = randomSuffix()
    const slug = `pw-post-archive-admin-${suffix}`
    const author = requireTestValue(
      await createTestUser({ username: `pw-archive-author-${suffix}` }),
      'Failed to create post author',
    )
    const postId = await insertTestPost({
      title: `Post Archive Admin ${suffix}`,
      slug,
      createdById: author.id,
      markdown: 'Post archive admin test.',
      postType: 'discussion',
    })

    await loginAsAdmin(page)
    await navigateTo(page, `/discussion/${postId}/edit`)
    await page.getByTestId('post-form-advanced-toggle').click()

    const archiveButton = page.getByTestId('post-archive-button')
    await expect(archiveButton).toBeVisible()
    const archiveResponse = waitForArchiveResponse(page, postId, slug, true)
    await archiveButton.click()
    await archiveResponse
    await expect(archiveButton).toHaveText('Unarchive')
    expect((await getPostArchivedFields(postId))?.archived_at).not.toBeNull()
  })

  test('non-owner cannot access the edit-page archive control', async ({ page }) => {
    const suffix = randomSuffix()
    const otherUser = requireTestValue(
      await createTestUser({ username: `pw-archive-other-${suffix}` }),
      'Failed to create other test user',
    )
    const postId = await insertTestPost({
      title: `Post Archive Non Owner ${suffix}`,
      slug: `pw-post-archive-nonowner-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Post archive non-owner test.',
      postType: 'discussion',
    })

    await loginAsUser(page, otherUser.id)
    await navigateTo(page, `/discussion/${postId}/edit`)

    await expect(page).toHaveURL(`/discussion/${postId}`)
    await expect(page.getByTestId('post-archive-button')).toHaveCount(0)
  })
})
