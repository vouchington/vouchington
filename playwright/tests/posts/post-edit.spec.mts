import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser, loginAsAdmin, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'
const SEEDED_ARTICLE_ID = '019c64e6-f720-7005-a005-000000000001'
const SEEDED_BLOG_POST_ID = '019c64e6-f720-7006-a006-000000000001'
const SEEDED_REVIEW_ID = '019c64e6-f720-7002-a002-000000000001'

let postId: string
let postSlug: string
let otherUserId: string
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  postSlug = `pw-post-edit-${suffix}`
  postId = await insertTestPost({
    title: `Post Edit Test ${suffix}`,
    slug: postSlug,
    createdById: TEST_USER_ID,
    markdown: 'Post edit feature test content.',
    postType: 'discussion',
  })

  const otherUser = await createTestUser({ username: `pw-edit-other-${suffix}` })
  if (!otherUser) throw new Error('Failed to create other test user')
  otherUserId = otherUser.id
})

test.describe('Post Edit', () => {
  test('signed-out user sees no Edit button on post detail', async ({ page }) => {
    await navigateTo(page, `/discussion/${postId}`)

    await expect(page.getByTestId('post-edit-button')).toHaveCount(0)
  })

  test('signed-in post author sees Edit button and can navigate to edit page', async ({ page }) => {
    await loginAsTestUser(page)
    await navigateTo(page, `/discussion/${postId}`)

    // Open the overflow kebab to reveal the edit link
    await page.getByTestId('post-detail-overflow-trigger').click()

    const editButton = page.getByTestId('post-edit-button')
    await expect(editButton).toBeVisible()

    await editButton.click()

    await expect(page).toHaveURL(`/discussion/${postSlug}/edit`)
  })

  test('signed-in non-author sees no Edit button on post detail', async ({ page }) => {
    await loginAsUser(page, otherUserId)
    await navigateTo(page, `/discussion/${postId}`)

    await expect(page.getByTestId('post-edit-button')).toHaveCount(0)
  })

  test("admin sees Edit button even on another user's post", async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, `/discussion/${postId}`)

    // Open the overflow kebab to reveal the edit link
    await page.getByTestId('post-detail-overflow-trigger').click()

    await expect(page.getByTestId('post-edit-button')).toBeVisible()
  })

  test('admin can navigate to the article edit page from post detail', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, `/article/${SEEDED_ARTICLE_ID}`)

    // Open the overflow kebab to reveal the edit link
    await page.getByTestId('post-detail-overflow-trigger').click()

    const editButton = page.getByTestId('post-edit-button')
    await expect(editButton).toBeVisible()

    await editButton.click()

    await expect(page).toHaveURL('/article/playwright-article-fixture/edit')
    await expect(page.getByTestId('edit-post-page-heading')).toHaveText('Edit Article')
    await expect(page.getByTestId('post-form')).toBeVisible()
  })

  test('admin can navigate to the blog post edit page from post detail', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, `/blog-post/${SEEDED_BLOG_POST_ID}`)

    // Open the overflow kebab to reveal the edit link
    await page.getByTestId('post-detail-overflow-trigger').click()

    const editButton = page.getByTestId('post-edit-button')
    await expect(editButton).toBeVisible()

    await editButton.click()

    await expect(page).toHaveURL('/blog-post/playwright-blog-post-fixture/edit')
    await expect(page.getByTestId('edit-post-page-heading')).toHaveText('Edit Blog Post')
    await expect(page.getByTestId('post-form')).toBeVisible()
  })

  test('admin sees official account gate on review edit page', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, `/review/${SEEDED_REVIEW_ID}`)

    // Open the overflow kebab to reveal the edit link
    await page.getByTestId('post-detail-overflow-trigger').click()

    const editButton = page.getByTestId('post-edit-button')
    await expect(editButton).toBeVisible()

    await editButton.click()

    await expect(page.getByTestId('official-account-edit-post-gate')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })
})
