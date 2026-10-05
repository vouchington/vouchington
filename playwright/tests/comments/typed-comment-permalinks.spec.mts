import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestPost } from '../../../backend/test-helpers/entities/create-test-entities.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'
import { withCleanUser } from '../../helpers/auth.mts'

test.describe('Typed comment permalink routes', () => {
  test.use({ storageState: AUTH_STATE })

  test('article comment belongs to its genuine root and returns to it', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Permalink article ${suffix}`
    const body = `Owned comment article ${suffix}`
    const root = await createTestPost({ title, post_type: 'article' })
    const comment = await createTestPost({
      post_type: 'comment',
      parent_post_id: root.id,
      markdown: body,
    })
    await navigateTo(page, `/article/${root.id}/comment/${comment.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Comment on ${title}`)
    await expect(page.locator('main')).toContainText(body)
    const rootLink = page.locator('main').getByTestId('comment-permalink-root-link')
    await expect(rootLink).toHaveAttribute('href', `/article/${root.slug}`)
    await rootLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  })

  test('blog-post comment belongs to its genuine root and returns to it', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Permalink blog-post ${suffix}`
    const body = `Owned comment blog-post ${suffix}`
    const root = await createTestPost({ title, post_type: 'blog_post' })
    const comment = await createTestPost({
      post_type: 'comment',
      parent_post_id: root.id,
      markdown: body,
    })
    await navigateTo(page, `/blog-post/${root.id}/comment/${comment.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Comment on ${title}`)
    await expect(page.locator('main')).toContainText(body)
    const rootLink = page.locator('main').getByTestId('comment-permalink-root-link')
    await expect(rootLink).toHaveAttribute('href', `/blog-post/${root.slug}`)
    await rootLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  })

  test('data-point comment belongs to its genuine root and returns to it', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Permalink data-point ${suffix}`
    const body = `Owned comment data-point ${suffix}`
    const root = await createTestPost({ title, post_type: 'data_point' })
    const comment = await createTestPost({
      post_type: 'comment',
      parent_post_id: root.id,
      markdown: body,
    })
    await navigateTo(page, `/data-point/${root.id}/comment/${comment.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Comment on ${title}`)
    await expect(page.locator('main')).toContainText(body)
    const rootLink = page.locator('main').getByTestId('comment-permalink-root-link')
    await expect(rootLink).toHaveAttribute('href', `/data-point/${root.slug}`)
    await rootLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  })

  test('link comment belongs to its genuine root and returns to it', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Permalink link ${suffix}`
    const body = `Owned comment link ${suffix}`
    const root = await createTestPost({
      title,
      post_type: 'link',
      url: `https://example.com/permalink-${suffix}`,
    })
    const comment = await createTestPost({
      post_type: 'comment',
      parent_post_id: root.id,
      markdown: body,
    })
    await navigateTo(page, `/link/${root.id}/comment/${comment.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Comment on ${title}`)
    await expect(page.locator('main')).toContainText(body)
    const rootLink = page.locator('main').getByTestId('comment-permalink-root-link')
    await expect(rootLink).toHaveAttribute('href', `/link/${root.slug}`)
    await rootLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  })

  test('review comment belongs to its genuine root and returns to it', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Permalink review ${suffix}`
    const body = `Owned comment review ${suffix}`
    const root = await createTestPost({ title, post_type: 'review' })
    const comment = await createTestPost({
      post_type: 'comment',
      parent_post_id: root.id,
      markdown: body,
    })
    await navigateTo(page, `/review/${root.id}/comment/${comment.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Comment on ${title}`)
    await expect(page.locator('main')).toContainText(body)
    const rootLink = page.locator('main').getByTestId('comment-permalink-root-link')
    await expect(rootLink).toHaveAttribute('href', `/review/${root.slug}`)
    await rootLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  })

  test('story comment belongs to its genuine root and returns to it', async ({ page }) => {
    const suffix = randomSuffix()
    const title = `Permalink story ${suffix}`
    const body = `Owned comment story ${suffix}`
    const user = await withCleanUser(page, { administrator: true })
    const slug = `permalink-story-${suffix}`
    const id = await insertTestPost({
      title,
      slug,
      postType: 'story',
      markdown: '',
      createdById: user.id,
    })
    const root = { id, slug }
    const comment = await createTestPost({
      post_type: 'comment',
      parent_post_id: root.id,
      markdown: body,
      user,
    })
    await navigateTo(page, `/story/${root.id}/comment/${comment.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Comment on ${title}`)
    await expect(page.locator('main')).toContainText(body)
    const rootLink = page.locator('main').getByTestId('comment-permalink-root-link')
    await expect(rootLink).toHaveAttribute('href', `/story/${root.slug}`)
    await rootLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  })
})
