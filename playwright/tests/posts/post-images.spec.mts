import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_PNG } from '../../helpers/test-fixtures.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestImage } from '../../../backend/test-helpers/entities/images.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'

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
    await write(
      `/* post-images-spec insertPostImage */ INSERT INTO post_images (post_id, image_id, order_index) VALUES ($1, $2, 0)`,
      [postId, imageId],
    )

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
    await write(
      `/* post-images-spec insertPostImageDetail */ INSERT INTO post_images (post_id, image_id, order_index) VALUES ($1, $2, 0)`,
      [postId, imageId],
    )

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

  test('uploads multiple images at once on post create form', async ({ page }) => {
    let uploadCounter = 0
    const imageIds: string[] = ['mock-img-a', 'mock-img-b', 'mock-img-c']

    // Navigate first to get the same-origin base URL for the mock S3 upload path.
    // The app's CSP connect-src only allows 'self' + specific S3 origins; using an
    // external mock-s3.example.com domain would be blocked by the browser before
    // Playwright could intercept it.
    await navigateTo(page, '/discussions/create')
    const baseUrl = new URL(page.url()).origin

    // Mock the upload-url endpoint to return sequential image IDs with a same-origin upload URL
    await page.route(
      url => url.toString().includes('/api/v1/images/upload-url'),
      async route => {
        const id = imageIds[uploadCounter++] ?? 'mock-img-fallback'
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            upload: {
              image_id: id,
              upload_url: `${baseUrl}/mock-s3-upload`,
              content_type: 'image/png',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
        })
      },
    )

    // Mock the S3 PUT at the same-origin path (avoids CSP connect-src restrictions)
    await page.route(
      url => url.toString().includes('/mock-s3-upload'),
      route => route.fulfill({ status: 200 }),
    )

    // Mock the completions endpoint for each image ID
    await page.route(
      url => url.toString().match(/\/api\/v1\/images\/mock-img-[a-z]+\/completions/) !== null,
      async route => {
        const reqUrl = route.request().url()
        const match = reqUrl.match(/\/api\/v1\/images\/(mock-img-[a-z]+)\/completions/)
        const id = match?.[1] ?? 'mock-img-fallback'
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ image: { id, upload_status: 'complete' } }),
        })
      },
    )

    // Mock upload-state polling for the mock image IDs.
    await page.route(
      url => url.toString().match(/\/api\/v1\/images\/mock-img-[a-z]+\/upload-state/) !== null,
      async route => {
        const reqUrl = route.request().url()
        const match = reqUrl.match(/\/api\/v1\/images\/(mock-img-[a-z]+)\/upload-state/)
        const id = match?.[1] ?? 'mock-img-fallback'
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            upload_state: {
              id,
              upload_status: 'complete',
              upload_error: null,
              ready: true,
              blocked: false,
            },
          }),
        })
      },
    )

    const fileInput = page.locator('input[type="file"]')

    await fileInput.setInputFiles([
      { name: 'image-a.png', mimeType: 'image/png', buffer: Buffer.from(TEST_PNG) },
      { name: 'image-b.png', mimeType: 'image/png', buffer: Buffer.from(TEST_PNG) },
      { name: 'image-c.png', mimeType: 'image/png', buffer: Buffer.from(TEST_PNG) },
    ])

    // All 3 caption inputs should appear after upload completes
    await expect(page.getByTestId('post-form-image-caption-input').nth(0)).toBeVisible()
    await expect(page.getByTestId('post-form-image-caption-input').nth(1)).toBeVisible()
    await expect(page.getByTestId('post-form-image-caption-input').nth(2)).toBeVisible()
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
    await write(
      `/* post-images-spec insertPostImageLightbox */ INSERT INTO post_images (post_id, image_id, order_index) VALUES ($1, $2, 0)`,
      [postId, imageId],
    )

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
    await write(
      `/* post-images-spec insertMultiImages1 */ INSERT INTO post_images (post_id, image_id, order_index) VALUES ($1, $2, 0)`,
      [postId, imageId1],
    )
    await write(
      `/* post-images-spec insertMultiImages2 */ INSERT INTO post_images (post_id, image_id, order_index) VALUES ($1, $2, 1)`,
      [postId, imageId2],
    )

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
    await write(
      `/* post-images-spec insertCompactThumbnail */ INSERT INTO post_images (post_id, image_id, order_index) VALUES ($1, $2, 0)`,
      [postId, imageId],
    )

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
