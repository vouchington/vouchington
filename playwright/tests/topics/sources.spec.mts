import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { captureIndividualElectionRequests } from '../../helpers/election-requests.mts'
import { mockCompletedRssFeedImport } from '../../helpers/rss-feed-import-route-mocks.mts'

test.describe('Sources Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('should display the feed-first sources directory', async ({ page }) => {
    await navigateTo(page, '/sources')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sources')
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
    await expect(page.getByTestId('sources-filter-publisher-type-trigger')).toBeVisible()
  })

  test('should not show Submit Source button to anonymous users', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/sources')
    await expect(page.getByTestId('sources-submit-source-button')).toBeHidden()
  })

  test('should show Submit Source button for logged-in users', async ({ page }) => {
    await navigateTo(page, '/sources')
    await expect(page.getByTestId('sources-submit-source-button')).toBeVisible()
  })

  test('opens submit source dialog when button is clicked', async ({ page }) => {
    await navigateTo(page, '/sources')
    await page.getByTestId('sources-submit-source-button').click()
    await expect(page.getByTestId('submit-source-dialog-title')).toBeVisible()
    await expect(page.getByTestId('create-source-form-urls')).toBeVisible()
    await expect(page.getByTestId('create-source-form-submit')).toBeVisible()
  })

  test('uses source election sidecars without individual browser election requests', async ({
    page,
  }) => {
    const individualElectionRequests = captureIndividualElectionRequests(page)

    await navigateTo(page, '/sources')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sources')
    expect(individualElectionRequests).toEqual([])
  })

  test('should search sources by text query via the combined search input', async ({ page }) => {
    await navigateTo(page, '/sources')

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.pressSequentially('fintech')
    await page.getByTestId('list-filters-search-submit').click()

    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('fintech')
  })

  test('should filter sources by publisher type via the inline select', async ({ page }) => {
    await navigateTo(page, '/sources')

    await page.getByTestId('sources-filter-publisher-type-trigger').click()
    await page.getByTestId('sources-filter-publisher-type-option-blog').click()

    await expect.poll(() => new URL(page.url()).searchParams.get('publisher_type')).toBe('blog')
  })

  test('should show feed-type suffix in source topic heading', async ({ page }) => {
    const suffix = randomSuffix()
    const slug = `test-news-feed-${suffix}`
    // Use a fixed display name so the visual snapshot is deterministic across runs.
    // The slug carries the random suffix to guarantee uniqueness.
    await insertTestTopic('Test Source Feed (News Feed)', slug, 'rss_feed')
    await navigateTo(page, `/source/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('(News Feed)')
  })

  test('shows import progress bar after multi-URL submission', async ({ page }) => {
    await mockCompletedRssFeedImport(page)
    await navigateTo(page, '/sources')
    await page.getByTestId('sources-submit-source-button').click()
    await page
      .getByTestId('create-source-form-urls')
      .pressSequentially('https://example.com/feed1.xml\nhttps://example.com/feed2.xml')
    await page.getByTestId('create-source-form-submit').click()
    await expect(page.getByTestId('create-source-form-progress')).toBeVisible()
  })
})
