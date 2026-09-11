import { test, expect } from '../../helpers/test.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'

import { AUTH_STATE } from '../../helpers/auth-state.mts'

import { randomSuffix } from '../../helpers/random-id.mts'

import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'

import { requireTestValue } from '../../helpers/assertions.mts'

import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'

import { createEntityRelationWithElection } from '../../../backend/test-helpers/entities/dispatch.mts'

// Fixed test user ID seeded by playwright-test-data.mts.
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

// URL ID of `test-item-1` seeded in playwright-test-data.mts.
// The RSS item's url_id links it to https://example.com/article1.
const TEST_ITEM_1_URL_ID = '019c64e6-f8b0-7000-b000-000000000003'

test.describe('News Page', () => {
  test.use({ storageState: AUTH_STATE })

  let storyTitle: string

  let storySlug: string

  test.beforeAll(async () => {
    // Seed a story-type post and link it to test-item-1's URL so that the /news
    // card for that item shows a "Discussions" link pointing to /story/<slug>.
    // This avoids triggering the story-teller OpenAI agent — we assert on the
    // already-resolved end state rather than waiting for the agent to finish.
    const random = randomSuffix()
    storyTitle = `Playwright Story Discussion ${random}`
    storySlug = `pw-story-discussion-${random}`

    const postId = await insertTestPost({
      title: storyTitle,
      slug: storySlug,
      createdById: TEST_USER_ID,
      markdown: '',
      postType: 'story',
    })

    // Link the story post to the seeded item's URL with votes_score_net > 0
    // so getPostIdsByUrlIds() includes it in related_posts_by_url_id.
    await createEntityRelationWithElection(postId, TEST_ITEM_1_URL_ID, TEST_USER_ID, 1)
  })

  test('/news renders h1 when logged out', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('News')
  })

  test('/news shows combined text and hashtag topic search', async ({ page }) => {
    await navigateTo(page, '/news')

    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
    await expect(page.getByTestId('list-filters-search-input')).toHaveAttribute(
      'placeholder',
      'Search by text or #topic',
    )
    await expect(page.getByTestId('list-filters-search-submit')).toBeVisible()
  })

  test('/news text search updates URL on submit', async ({ page }) => {
    await navigateTo(page, '/news')

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.pressSequentially('architecture')
    await searchInput.press('Enter')

    await page.waitForURL(/q=architecture/)
    expect(page.url()).toContain('q=architecture')
  })

  test('/news title links to original article', async ({ page }) => {
    await navigateTo(page, '/news')

    // Title links are the only links in card headers that include the external-link icon.
    const articleLinks = page.getByTestId('news-item-card').getByTestId('news-item-title-link')
    await expect(articleLinks.first()).toBeVisible()

    const firstLink = articleLinks.first()
    // External links should be absolute URLs
    await expect(firstLink).toHaveAttribute('href', /^https?:\/\//)
  })

  test('/news hydrates without warnings when compact feed style is stored', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('feed-style', 'compact')
    })
    await navigateTo(page, '/news')

    await expect(page.getByTestId('news-item-card').first()).toBeVisible()
  })

  test('/news shows feed view toggle and it controls excerpt visibility', async ({ page }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page, ['feed-style'])
    await navigateTo(page, '/news?topics=doctor-of-credit-news')

    // Toggle must be visible to anonymous users
    await expect(page.getByTestId('feed-view-toggle-trigger')).toBeVisible()

    // In summary (card) mode seeded articles with excerpts should show excerpt text
    await expect
      .poll(() => page.getByTestId('news-item-excerpt').count(), {
        message: 'seeded news articles with excerpts should show excerpt text in summary mode',
      })
      .toBeGreaterThan(0)

    // Switch to compact — excerpts should disappear
    await page.getByTestId('feed-view-toggle-trigger').click()
    await page.getByTestId('feed-view-toggle-compact').click()
    await expect(page.getByTestId('news-item-excerpt')).toHaveCount(0)

    // Switch back to card — excerpts should reappear (option value is 'summary')
    await page.getByTestId('feed-view-toggle-trigger').click()
    await page.getByTestId('feed-view-toggle-summary').click()
    await expect.poll(() => page.getByTestId('news-item-excerpt').count()).toBeGreaterThan(0)
  })

  test('/news shows "Show more" that opens modal', async ({ page }) => {
    // Scope to the seeded source so the 2099 modal story stays on page 1 when
    // other suites insert newer /news items (same crowding the related-articles
    // test already documents for doctor-of-credit-news).
    await navigateTo(page, '/news?topics=test-news-source')

    const modalStory = page
      .getByTestId('news-item-card')
      .filter({ hasText: 'Playwright Modal Story Primary' })
      .first()
    await expect(modalStory).toBeVisible()
    await modalStory.getByTestId('news-item-show-more-link').click()
    await page.waitForURL(/rss_item=/)

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('/news modal does not scroll page to top', async ({ page }) => {
    await navigateTo(page, '/news')

    await page.evaluate(() => window.scrollTo(0, 200))

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    const scrollBefore = await page.evaluate(() => window.scrollY)
    await waitForBelowFoldHydration(page)
    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    // Scroll position should not reset to 0
    const scrollAfter = await page.evaluate(() => window.scrollY)
    // Allow some tolerance for rendering shifts
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(50)
  })

  test('related articles button expands when clicked', async ({ page }) => {
    // Use the seeded Doctor of Credit News topic to guarantee the cluster items
    // appear on page 1; the global /news feed may be crowded with newer test-created
    // items from other suites (e.g. no-eager-pagination-fetch creates 30 fresh items).
    await navigateTo(page, '/news?topics=doctor-of-credit-news')

    const relatedButton = page.getByTestId('news-item-cluster-related-toggle')
    await expect
      .poll(() => relatedButton.count(), { message: 'seeded related articles should be visible' })
      .toBeGreaterThan(0)

    const firstButton = relatedButton.first()
    await expect(firstButton).toHaveAttribute('aria-controls')
    const controlledId = await firstButton.evaluate(el => el.getAttribute('aria-controls'))
    expect(controlledId).not.toBeNull()

    const relatedItemsPanel = page.locator(`#${controlledId}`)
    await expect(relatedItemsPanel).toBeHidden()

    await firstButton.click()

    await expect(relatedItemsPanel).toBeVisible()
  })

  test('news link is visible in sidebar under Browse', async ({ page }) => {
    await navigateTo(page, '/news')

    const sidebar = page.getByTestId('sidebar-peer')
    const newsLink = sidebar.getByTestId('sidebar-nav-all-news')
    await expect(newsLink).toBeVisible()
  })

  test('/news modal renders article content without raw HTML tags', async ({ page }) => {
    await navigateTo(page, '/news?topics=test-news-source')

    const modalStory = page
      .getByTestId('news-item-card')
      .filter({ hasText: 'Playwright Modal Story Primary' })
      .first()
    await expect(modalStory).toBeVisible()
    await modalStory.getByTestId('news-item-show-more-link').click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Scope sanitization checks to the rendered article content area only.
    // The dialog may also contain a VideoEmbed iframe or PodcastEpisodePlayer,
    // which are legitimate UI elements unrelated to the RSS HTML content.
    // oxlint-disable-next-line no-mistakes/playwright-selector-priority -- Tailwind Typography prose container has no ARIA equivalent
    const contentArea = dialog.locator('.prose')
    await expect(contentArea).toBeVisible()
    // Verify that unsafe HTML elements are not rendered in the sanitized content
    await expect(contentArea.locator('script, style, iframe')).toHaveCount(0)

    const elementsWithInlineHandlers = await contentArea
      .locator('*')
      .evaluateAll(elements =>
        elements.flatMap(element =>
          [...element.attributes].some(attr => /^on/i.test(attr.name)) ? [element.outerHTML] : [],
        ),
      )
    expect(elementsWithInlineHandlers).toEqual([])

    const unsafeLinkHrefs = await contentArea.locator('a[href]').evaluateAll(links =>
      // Only flag hrefs that have a URL scheme that isn't in the safe list.
      // Relative links (e.g. "page-name", "/path", "#anchor") are allowed.
      links.flatMap(link => {
        const href = link.getAttribute('href') ?? ''
        return /^[a-zA-Z][a-zA-Z0-9+\-.]*:/i.test(href) && !/^(https?:|mailto:|tel:)/i.test(href)
          ? [href]
          : []
      }),
    )
    expect(unsafeLinkHrefs).toEqual([])
  })

  test('/news modal title is a clickable link to original article', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The dialog title must contain an anchor linking to an external URL
    const titleLink = dialog.getByTestId('rss-feed-item-modal-title-link')
    await expect(titleLink).toBeVisible()
    const href = requireTestValue(
      await titleLink.getAttribute('href'),
      'Expected news modal title link href',
    )
    expect(href).toMatch(/^https?:\/\//)
  })
})
