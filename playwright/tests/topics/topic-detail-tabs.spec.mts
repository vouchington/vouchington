import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Seed data IDs — topics are displayed as "cards" in the UI (URL: /card/:id)
const CHASE_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const CHASE_TOPIC_SLUG = 'chase-sapphire-preferred'
const AMEX_TOPIC_ID = '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1'
const VENTURE_TOPIC_ID = '019c64e6-f716-722f-b05c-f4c4f7b93cd0'

test.describe('Topic Detail Menubar', () => {
  // Requires seed data:
  // - "Chase Sapphire Preferred" card with discussions, reviews, and data-points
  // - "American Express Gold" card with reviews and discussions (but no data-points)
  // - "Capital One Venture" card with no content (empty state)

  test('redirects base topic URL to first non-empty tab (posts)', async ({ page }) => {
    // Navigate to the base URL without a subpage — should redirect to /posts
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}`)

    // Should redirect to /posts (not /discussions)
    await expect(page).toHaveURL(/\/card\/[^/]+\/posts/)
  })

  test('displays navigation items for card with content', async ({ page }) => {
    const requests: string[] = []
    page.on('request', request => {
      requests.push(request.url())
    })

    // Navigate directly to card's posts tab using known seed ID
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/posts`)

    // Verify URL is on posts tab
    await expect(page).toHaveURL(/\/card\/[^/]+\/posts/)

    // Verify navigation is visible
    await expect(page.getByTestId('entity-menubar-nav')).toBeVisible()

    // Verify specific items exist with counts in their label
    await expect(page.getByTestId('topic-detail-tab-posts')).toHaveText(/Posts \(\d+\+?\)/)
    await expect(page.getByTestId('topic-detail-tab-reviews')).toHaveText(/Reviews \(\d+\+?\)/)
    await expect(page.getByTestId('topic-detail-tab-data-points')).toHaveText(
      /Data Points \(\d+\+?\)/,
    )

    expect(requests.some(url => url.includes('/api/v1/rss-feeds?topic='))).toBe(false)
    expect(
      requests.some(
        url =>
          url.includes('/api/v1/posts?') &&
          url.includes('limit=1') &&
          (url.includes('topics=') || url.includes('review_topic=')),
      ),
    ).toBe(false)
  })

  test('switches between navigation items', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/posts`)

    // Switch to Reviews tab
    const reviewsTab = page.getByTestId('topic-detail-tab-reviews')
    await reviewsTab.click()

    // Verify URL changed
    await expect(page).toHaveURL(/\/card\/[^/]+\/reviews/)

    // Switch to Data Points tab
    const dataPointsTab = page.getByTestId('topic-detail-tab-data-points')
    await dataPointsTab.click()

    // Verify URL changed
    await expect(page).toHaveURL(/\/card\/[^/]+\/data-points/)
  })

  test('shows available navigation items for card with partial content', async ({ page }) => {
    // American Express Gold has reviews and discussions but no data points
    await navigateTo(page, `/card/${AMEX_TOPIC_ID}/reviews`)

    // Verify on reviews tab
    await expect(page).toHaveURL(/\/card\/[^/]+\/reviews/)

    // Verify navigation is visible
    await expect(page.getByTestId('entity-menubar-nav')).toBeVisible()

    // Reviews item should be visible (AMEX has 4 reviews)
    await expect(page.getByTestId('topic-detail-tab-reviews')).toHaveText(/Reviews \(\d+\+?\)/)

    // Posts item should be visible (AMEX has 1 discussion)
    await expect(page.getByTestId('topic-detail-tab-posts')).toHaveText(/Posts \(\d+\+?\)/)

    // Data Points item should not be in the DOM at all (AMEX has no data points)
    await expect(page.getByTestId('topic-detail-tab-data-points')).toHaveCount(0)
  })

  test('handles card with no content (empty state)', async ({ page }) => {
    // Navigate to card with no content — redirects to /posts via getDefaultTopicSubpage
    await navigateTo(page, `/card/${VENTURE_TOPIC_ID}/posts`)

    // Should show empty state on posts tab
    await expect(page).toHaveURL(/\/card\/[^/]+\/posts/)

    // Posts item is visible because user is directly on /posts (escape hatch)
    await expect(page.getByTestId('entity-menubar-nav')).toBeVisible()
    await expect(page.getByTestId('topic-detail-tab-posts')).toHaveText('Posts')

    // Other count-driven items must not appear for a topic with no content
    await expect(page.getByTestId('topic-detail-tab-reviews')).toHaveCount(0)
    await expect(page.getByTestId('topic-detail-tab-data-points')).toHaveCount(0)
    await expect(page.getByTestId('topic-detail-tab-latest')).toHaveCount(0)
    await expect(page.getByTestId('topic-detail-tab-news')).toHaveCount(0)
  })

  test('tab links preserve slug in URL when navigating between tabs', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_SLUG}/posts`)

    // Click Reviews tab — href must use slug, not UUID
    await page.getByTestId('topic-detail-tab-reviews').click()
    await expect(page).toHaveURL(`/card/${CHASE_TOPIC_SLUG}/reviews`)

    // Click Data Points tab — still slug
    await page.getByTestId('topic-detail-tab-data-points').click()
    await expect(page).toHaveURL(`/card/${CHASE_TOPIC_SLUG}/data-points`)
  })

  test('hides empty items unless on the empty item URL', async ({ page }) => {
    // AMEX has reviews and discussions but no data points (per seed comment above)
    await navigateTo(page, `/card/${AMEX_TOPIC_ID}/data-points`)

    await expect(page.getByTestId('entity-menubar-nav')).toBeVisible()

    // Data Points item is visible because user navigated directly to /data-points,
    // but shown without a count since the count is 0
    await expect(page.getByTestId('topic-detail-tab-data-points')).toHaveText('Data Points')

    // Navigate away to an item with content — Data Points should now be hidden
    await navigateTo(page, `/card/${AMEX_TOPIC_ID}/reviews`)

    await expect(page).toHaveURL(/\/card\/[^/]+\/reviews/)
    await expect(page.getByTestId('topic-detail-tab-data-points')).toHaveCount(0)
  })
})
