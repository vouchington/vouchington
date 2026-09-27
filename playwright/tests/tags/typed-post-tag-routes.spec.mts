import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestPost } from '../../../backend/test-helpers/entities/create-test-entities.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'
import { createTestUser } from '../../../backend/test-helpers/entities/users.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Typed post tag management', () => {
  test.use({ storageState: AUTH_STATE })

  test('blog-post category tags attach a genuine searched topic', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Tag post blog-post ${suffix}`
    const post = await createTestPost({ title, post_type: 'blog_post' })
    const id = post.id
    const targetName = `Post category ${suffix}`
    await insertTestTopic(targetName, `post-category-${suffix}`, 'topic')
    await navigateTo(page, `/blog-post/${id}/tags/topic`)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Category Topics')
    await expect(page.getByTestId('manage-post-tags-content')).toBeVisible()
    await page.getByTestId('tag-autocomplete-input-topic').pressSequentially(targetName)
    await page.getByTestId('tag-autocomplete-item-topic').filter({ hasText: targetName }).click()
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('data-point category tags attach a genuine searched topic', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Tag post data-point ${suffix}`
    const post = await createTestPost({ title, post_type: 'data_point' })
    const id = post.id
    const targetName = `Post category ${suffix}`
    await insertTestTopic(targetName, `post-category-${suffix}`, 'topic')
    await navigateTo(page, `/data-point/${id}/tags/topic`)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Category Topics')
    await expect(page.getByTestId('manage-post-tags-content')).toBeVisible()
    await page.getByTestId('tag-autocomplete-input-topic').pressSequentially(targetName)
    await page.getByTestId('tag-autocomplete-item-topic').filter({ hasText: targetName }).click()
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('link category tags attach a genuine searched topic', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Tag post link ${suffix}`
    const post = await createTestPost({
      title,
      post_type: 'link',
      url: `https://example.com/tag-link-${suffix}`,
    })
    const id = post.id
    const targetName = `Post category ${suffix}`
    await insertTestTopic(targetName, `post-category-${suffix}`, 'topic')
    await navigateTo(page, `/link/${id}/tags/topic`)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Category Topics')
    await expect(page.getByTestId('manage-post-tags-content')).toBeVisible()
    await page.getByTestId('tag-autocomplete-input-topic').pressSequentially(targetName)
    await page.getByTestId('tag-autocomplete-item-topic').filter({ hasText: targetName }).click()
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })

  test('story category tags attach a genuine searched topic', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Tag post story ${suffix}`
    const user = requireTestValue(await createTestUser(), 'Story fixture owner missing')
    const id = await insertTestPost({
      title,
      slug: `tag-story-${suffix}`,
      markdown: '',
      postType: 'story',
      createdById: user.id,
    })
    const targetName = `Post category ${suffix}`
    await insertTestTopic(targetName, `post-category-${suffix}`, 'topic')
    await navigateTo(page, `/story/${id}/tags/topic`)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Category Topics')
    await expect(page.getByTestId('manage-post-tags-content')).toBeVisible()
    await page.getByTestId('tag-autocomplete-input-topic').pressSequentially(targetName)
    await page.getByTestId('tag-autocomplete-item-topic').filter({ hasText: targetName }).click()
    await expect(page.getByTestId('manage-tags-current-section')).toContainText(targetName)
  })
})
