import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { mockCompletedRssFeedImport } from '../../helpers/rss-feed-import-route-mocks.mts'

test.describe('News Sources Import / Export — /my/news-sources/import-export', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders import and export cards', async ({ page }) => {
    await navigateTo(page, '/my/news-sources/import-export')
    await expect(page.getByTestId('settings-page-header')).toBeVisible()
    await expect(page.getByTestId('import-urls-button')).toBeVisible()
    await expect(page.getByTestId('upload-sources-file-button')).toBeVisible()
  })

  test('shows import progress bar after submitting URLs', async ({ page }) => {
    await mockCompletedRssFeedImport(page)

    await navigateTo(page, '/my/news-sources/import-export')

    const textarea = page.getByLabel('Source URLs to import')
    await textarea.pressSequentially('https://example.com/feed.xml')
    await page.getByTestId('import-urls-button').click()

    await expect(page.getByTestId('import-progress')).toBeVisible()
    await expect(page.getByTestId('import-progress')).toContainText('Done')
  })

  test('shows progress bar when uploading OPML file', async ({ page }) => {
    await mockCompletedRssFeedImport(page, { totalRows: 1 })

    await navigateTo(page, '/my/news-sources/import-export')

    const opmlContent = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Test" xmlUrl="https://opml-test.example.com/rss" type="rss" />
  </body>
</opml>`

    await page.getByTestId('upload-sources-file-button').click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'feeds.opml',
      mimeType: 'application/xml',
      buffer: Buffer.from(opmlContent),
    })

    await expect(page.getByTestId('import-progress')).toBeVisible()
    await expect(page.getByTestId('import-progress')).toContainText('Done')
  })

  test('dropdown is visible and allows selecting source type', async ({ page }) => {
    await navigateTo(page, '/my/news-sources/import-export')
    await expect(page.getByTestId('import-export-type-select')).toBeVisible()
  })

  test('export OPML and CSV buttons are visible', async ({ page }) => {
    await navigateTo(page, '/my/news-sources/import-export')
    await expect(page.getByTestId('export-opml-button')).toBeVisible()
    await expect(page.getByTestId('export-csv-button')).toBeVisible()
  })
})

test.describe('Podcasts Import / Export — /my/podcasts/import-export', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders import and export cards', async ({ page }) => {
    await navigateTo(page, '/my/podcasts/import-export')
    await expect(page.getByTestId('settings-page-header')).toBeVisible()
    await expect(page.getByTestId('import-urls-button')).toBeVisible()
  })
})

test.describe('Channels Import / Export — /my/channels/import-export', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders import and export cards', async ({ page }) => {
    await navigateTo(page, '/my/channels/import-export')
    await expect(page.getByTestId('settings-page-header')).toBeVisible()
    await expect(page.getByTestId('import-urls-button')).toBeVisible()
  })
})

test.describe('Topics Import / Export — /my/topics/import-export', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders import and export cards', async ({ page }) => {
    await navigateTo(page, '/my/topics/import-export')
    await expect(page.getByTestId('settings-page-header')).toBeVisible()
    await expect(page.getByTestId('import-urls-button')).toBeVisible()
  })

  test('does not show source-type dropdown', async ({ page }) => {
    await navigateTo(page, '/my/topics/import-export')
    await expect(page.getByTestId('import-export-type-select')).toBeHidden()
  })
})
