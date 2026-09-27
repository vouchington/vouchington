import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_PNG } from '../../helpers/test-fixtures.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestImage,
  insertTestPostImage,
} from '../../../backend/test-helpers/entities/images.mts'
import { allowTestPostImageDelivery } from '../../../backend/test-helpers/entities/post-images.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Post Images', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows upload button in post form', async ({ page }) => {
    await navigateTo(page, '/discussions/create')

    await expect(page.getByTestId('post-image-upload')).toBeAttached()
    const addImageButton = page.getByTestId('post-image-upload-trigger')
    await expect(addImageButton).toBeVisible()
  })

  test('shows image thumbnail for a seeded post image', async ({ page }) => {
    const suffix = randomSuffix()
    const slug = `image-thumbnail-test-${suffix}`
    const postId = await insertTestPost({
      title: `Image Thumbnail Test ${suffix}`,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post with an image attachment.',
    })
    const imageId = await insertTestImage(TEST_USER_ID)
    await insertTestPostImage({ postId, imageId })
    await allowTestPostImageDelivery({ postId, imageId })

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, `/discussion/${slug}`)

    await expect(page.locator('img[src*="/images/"]')).toBeVisible()
  })

  test('renders images on post detail page for a seeded post', async ({ page }) => {
    const suffix = randomSuffix()
    const slug = `image-detail-test-${suffix}`
    const postId = await insertTestPost({
      title: `Image Detail Test ${suffix}`,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post with an image attachment.',
    })
    const imageId = await insertTestImage(TEST_USER_ID)
    await insertTestPostImage({ postId, imageId })
    await allowTestPostImageDelivery({ postId, imageId })

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, `/discussion/${slug}`)

    const postImage = page.locator('img[src*="/images/"]')
    await expect(postImage).toBeVisible()

    const src = await postImage.getAttribute('src')
    expect(src).toMatch(/\/images\/[^?]+\?w=\d+/)
  })

  test('opens fullscreen lightbox when post detail image is clicked', async ({ page }) => {
    const suffix = randomSuffix()
    const slug = `lightbox-test-${suffix}`
    const postId = await insertTestPost({
      title: `Lightbox Test ${suffix}`,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post for lightbox testing.',
    })
    const imageId = await insertTestImage(TEST_USER_ID)
    await insertTestPostImage({ postId, imageId })
    await allowTestPostImageDelivery({ postId, imageId })

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, `/discussion/${slug}`)

    // Lightbox should not be open initially
    await expect(page.getByRole('dialog')).toBeHidden()

    // Click the image button to open lightbox
    await page.getByTestId('post-detail-image-button').click()

    // Lightbox dialog should open
    await expect(page.getByRole('dialog')).toBeVisible()

    // Close by pressing Escape
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('renders centered images and carousel arrows on multi-image post detail', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const slug = `multi-image-detail-${suffix}`
    const postId = await insertTestPost({
      title: `Multi-Image Detail Test ${suffix}`,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post with multiple images.',
    })

    const imageId1 = await insertTestImage(TEST_USER_ID)
    const imageId2 = await insertTestImage(TEST_USER_ID)
    await insertTestPostImage({ postId, imageId: imageId1, orderIndex: 0 })
    await insertTestPostImage({ postId, imageId: imageId2, orderIndex: 1 })
    await Promise.all([
      allowTestPostImageDelivery({ postId, imageId: imageId1 }),
      allowTestPostImageDelivery({ postId, imageId: imageId2 }),
    ])

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, `/discussion/${slug}`)

    // Both carousel nav buttons should be rendered
    await expect(page.getByTestId('carousel-previous').first()).toBeVisible()
    await expect(page.getByTestId('carousel-next').first()).toBeVisible()
  })

  test('compact list view thumbnail navigates to post detail when clicked', async ({ page }) => {
    const suffix = randomSuffix()
    const slug = `compact-thumbnail-${suffix}`
    const postId = await insertTestPost({
      title: `Compact Thumbnail Test ${suffix}`,
      slug,
      createdById: TEST_USER_ID,
      markdown: 'Post for compact view testing.',
    })
    const imageId = await insertTestImage(TEST_USER_ID)
    await insertTestPostImage({ postId, imageId })
    await allowTestPostImageDelivery({ postId, imageId })

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    // Sort by newest so the freshly seeded post appears at the top of page 1
    // regardless of how many other posts exist in the (dirty) test database.
    await navigateTo(page, '/discussions?sort=new')

    // Switch to compact view
    await page.getByTestId('post-view-toggle-trigger').click()
    await page.getByTestId('post-view-toggle-compact').click()

    // The thumbnail is wrapped in a <Link> to the post, so clicking it navigates directly.
    const thumbnail = page.locator(`img[alt="Compact Thumbnail Test ${suffix}"]`).first()
    await expect(thumbnail).toBeVisible()
    await thumbnail.scrollIntoViewIfNeeded()
    await thumbnail.click()

    // The thumbnail link uses post.id (UUID), not the slug
    await page.waitForURL(`**/discussion/${postId}`)
    await expect(page.getByTestId('post-detail-heading')).toContainText(
      `Compact Thumbnail Test ${suffix}`,
    )
  })
})
