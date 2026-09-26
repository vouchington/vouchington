import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

/** Only the upload transport/processing responses are mocked; browser bytes and CSP are real. */
async function mockUploads(page: Page) {
  const imageIds: string[] = []
  const putIds: string[] = []
  const completedIds: string[] = []
  const publicImageRequests: string[] = []
  const origin = new URL(page.url()).origin
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/images/') && imageIds.some(id => path.includes(id)))
      publicImageRequests.push(request.url())
  })
  await page.route('**/api/v1/images/upload-url', async route => {
    const id = crypto.randomUUID()
    imageIds.push(id)
    await route.fulfill({
      json: {
        upload: {
          image_id: id,
          upload_url: `${origin}/mock-s3-upload/${id}`,
          content_type: route.request().postDataJSON().content_type,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    })
  })
  await page.route('**/mock-s3-upload/*', async route => {
    expect(route.request().method()).toBe('PUT')
    putIds.push(new URL(route.request().url()).pathname.split('/').at(-1)!)
    await route.fulfill({ status: 200 })
  })
  await page.route('**/api/v1/images/*/completions', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    completedIds.push(id)
    await route.fulfill({ json: { image: { id, upload_status: 'complete' } } })
  })
  await page.route('**/api/v1/images/*/upload-state', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    await route.fulfill({
      json: {
        upload_state: {
          id,
          upload_status: 'complete',
          upload_error: null,
          ready: true,
          blocked: false,
        },
      },
    })
  })
  return { imageIds, putIds, completedIds, publicImageRequests }
}

async function selectedPngFiles(page: Page) {
  const encoded = await page.evaluate(() =>
    [
      [8, 6],
      [13, 9],
      [21, 11],
    ].map(([width, height], index) => {
      const canvas = document.createElement('canvas')
      canvas.width = width!
      canvas.height = height!
      const context = canvas.getContext('2d')!
      context.fillStyle = ['red', 'green', 'blue'][index]!
      context.fillRect(0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png').split(',')[1]!
    }),
  )
  return encoded.map((base64, index) => ({
    name: `selected-${index}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  }))
}

test.describe('Selected post image previews', () => {
  test.use({ storageState: AUTH_STATE })

  test('decodes each original selected PNG locally and keeps it on caption edits', async ({
    page,
  }, testInfo) => {
    await navigateTo(page, '/discussions/create')
    const uploads = await mockUploads(page)
    await page.getByTestId('post-image-upload').setInputFiles(await selectedPngFiles(page))

    const previews = page.getByTestId('upload-image-preview')
    await expect(previews).toHaveCount(3)
    await expect
      .poll(() =>
        previews.evaluateAll(images =>
          images.map(image => {
            const img = image as HTMLImageElement
            return [img.naturalWidth, img.naturalHeight]
          }),
        ),
      )
      .toEqual([
        [8, 6],
        [13, 9],
        [21, 11],
      ])
    const urls = await previews.evaluateAll(images =>
      images.map(image => (image as HTMLImageElement).src),
    )
    expect(urls.every(url => url.startsWith('blob:'))).toBe(true)
    expect(new Set(urls).size).toBe(3)
    expect(uploads.completedIds.toSorted()).toEqual(uploads.imageIds.toSorted())
    expect(uploads.putIds.toSorted()).toEqual(uploads.imageIds.toSorted())
    expect(uploads.imageIds).toHaveLength(3)

    const caption = page.getByTestId('post-form-image-caption-input').nth(1)
    await caption.pressSequentially('Selected green image')
    await expect(previews.nth(1)).toHaveAttribute('alt', 'Selected green image')
    await expect(previews.nth(1)).toHaveAttribute('src', urls[1]!)
    expect(uploads.publicImageRequests).toEqual([])

    const screenshotPath = join(
      await mkdtemp(join(tmpdir(), 'voucha-upload-preview-')),
      'preview.png',
    )
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await testInfo.attach('local-upload-preview', {
      path: screenshotPath,
      contentType: 'image/png',
    })
    testInfo.annotations.push({ type: 'preview-screenshot', description: screenshotPath })
  })

  test('shows an accessible fallback for uploaded bytes the browser cannot decode', async ({
    page,
  }) => {
    await navigateTo(page, '/discussions/create')
    const uploads = await mockUploads(page)
    await page.getByTestId('post-image-upload').setInputFiles({
      name: 'undecodable.tiff',
      mimeType: 'image/tiff',
      buffer: Buffer.from('49492a0008000000000000000000', 'hex'),
    })

    await expect(page.getByTestId('post-form-image-caption-input')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Preview unavailable')
    await expect(page.getByTestId('upload-image-preview')).toHaveCount(0)
    expect(uploads.completedIds).toEqual(uploads.imageIds)
    expect(uploads.putIds).toEqual(uploads.imageIds)
    expect(uploads.imageIds).toHaveLength(1)
    expect(uploads.publicImageRequests).toEqual([])
  })
})
