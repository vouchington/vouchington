import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  scrollToLoadMore,
  forceMainScrollableBeforeHydration,
} from '../../helpers/scroll-to-load-more.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Seeded multi-topic review: Chase Sapphire Preferred (5★) vs American Express Gold (3★)
const MULTI_TOPIC_REVIEW_ID = '019c64e6-f720-7002-a002-000000000020'

test.describe('Reviews Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('should display reviews list page', async ({ page }) => {
    await navigateTo(page, '/reviews')
    await waitForBelowFoldHydration(page)

    // Check page title
    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('Reviews')

    // Check for search input
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()

    // Check for sort filters
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-hot')).toBeVisible()
    await expect(page.getByTestId('list-filters-sort-option-new')).toBeVisible()
  })

  test('should filter by sort order', async ({ page }) => {
    await navigateTo(page, '/reviews')
    await waitForBelowFoldHydration(page)

    // Select New filter
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await page.getByTestId('list-filters-sort-option-new').click()

    // URL should update with sort parameter
    await expect(page).toHaveURL(/.*sort=new/)
  })

  test('should search for posts', async ({ page }) => {
    await navigateTo(page, '/reviews')

    // Type in search input
    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.pressSequentially('credit card')
    await searchInput.press('Enter')

    // URL should update with search query
    await expect(page).toHaveURL(/.*q=credit/)
  })

  test('should not add ?after= to URL after page load', async ({ page }) => {
    // Regression test: the old InfiniteScroll used router.push() which would
    // append ?after=<cursor> to the URL, replacing the list with only page 2.
    await navigateTo(page, '/reviews?sort=new')

    // URL must not contain an `after` cursor — that would mean the broken
    // router.push() path triggered and navigated away from the initial page.
    await expect(page).not.toHaveURL(/after=/)
  })

  test('should make no client-side requests to /api/v1/posts on initial load', async ({ page }) => {
    const apiRequests: string[] = []

    page.on('request', req => {
      // Capture only non-pagination requests — pagination requests (after=...) are expected on scroll
      if (req.url().includes('/api/v1/posts') && !req.url().includes('after=')) {
        apiRequests.push(req.url())
      }
    })

    await navigateTo(page, '/reviews?sort=new')

    // The old bug caused 8 browser-visible requests because the IntersectionObserver fired
    // repeatedly while router.push() was pending. With SSR, the initial fetch is server-to-server
    // (not visible to the browser), so 0 browser requests are expected on initial load.
    expect(apiRequests).toHaveLength(0)
  })

  test('scroll-triggered pagination request has clean params', async ({ page }) => {
    // Force the page taller than the viewport before hydration so InfiniteScroll's
    // short-page escape hatch cannot auto-load the next page on its own — this test
    // must exercise the scroll-gated path, not the escape hatch.
    await forceMainScrollableBeforeHydration(page)
    await navigateTo(page, '/reviews?sort=new')

    await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()

    // Set up waitForRequest BEFORE scrolling so the promise captures the request
    // regardless of whether it fires before or after networkidle.
    // (Using page.on + networkidle is flaky: networkidle can resolve before the
    // IntersectionObserver triggers the pagination fetch.)
    const paginationRequestPromise = page.waitForRequest(
      req => req.url().includes('/api/v1/posts') && req.url().includes('after='),
    )
    await scrollToLoadMore(page)
    const paginationRequest = await paginationRequestPromise

    const url = paginationRequest.url()
    expect(url).not.toMatch(/[?&]\w+=undefined/)
    expect(url).toContain('after=')
    expect(url).toContain('sort=new')
  })

  test('should keep existing posts visible after scrolling to bottom', async ({ page }) => {
    await forceMainScrollableBeforeHydration(page)
    await navigateTo(page, '/reviews?sort=new')

    await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()

    // Capture the initial post count
    const cards = page.getByTestId('post-card-root')
    const initialCards = await cards.count()

    const nextPageResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/posts') &&
        response.status() === 200 &&
        new URL(response.url()).searchParams.has('after'),
    )

    // Scroll to the bottom to trigger infinite scroll
    await scrollToLoadMore(page)
    await nextPageResponse

    // Posts that were visible before should still be visible (not replaced) — the
    // falsifiable form of the regression this guards: if page 2 replaced page 1
    // instead of appending, the count would drop instead of grow.
    await expect.poll(() => cards.count()).toBeGreaterThan(initialCards)
  })
})

test.describe('Multi-Topic Review', () => {
  test.use({ storageState: AUTH_STATE })

  test('should display multi-topic review with multiple ratings', async ({ page }) => {
    await navigateTo(page, `/review/${MULTI_TOPIC_REVIEW_ID}`)

    await expect(page).toHaveURL(`/review/${MULTI_TOPIC_REVIEW_ID}`)

    // Star rating badge pills are TopicLabel anchors with data-pw='topic-label'
    await expect(page.getByTestId('topic-label').first()).toBeVisible()
    // Verify topic names appear somewhere on the page (scoped to avoid strict mode violation)
    await expect(page.locator('body')).toContainText('Chase Sapphire Preferred')
    await expect(page.locator('body')).toContainText('American Express Gold')
  })
})

test.describe('Create Review Form', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create review contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/reviews/create')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('shows review form with Topics & Ratings fieldset for authenticated user', async ({
    page,
  }) => {
    await navigateTo(page, '/reviews/create')

    await expect(page.getByTestId('new-review-heading')).toBeVisible()

    // Topics & Ratings fieldset should be present
    await expect(page.getByTestId('review-topics-ratings-legend')).toBeVisible()

    // Add Topic button should be visible
    await expect(page.getByTestId('review-add-topic-button')).toBeVisible()
  })

  test('shows content-length counter when review is too short', async ({ page }) => {
    await navigateTo(page, '/reviews/create')
    await waitForBelowFoldHydration(page)

    const textarea = page.getByTestId('post-form-content-textarea')
    await textarea.pressSequentially('too short')

    // Counter should be visible and in the error (destructive) state
    await expect(page.getByTestId('review-content-counter')).toContainText(
      /min 150 chars \/ 30 words \/ 3 sentences/,
    )
  })

  test('focuses topic search input when Add Topic is clicked', async ({ page }) => {
    await navigateTo(page, '/reviews/create')
    await waitForBelowFoldHydration(page)

    // One topic row exists initially
    await expect(page.getByTestId('review-add-topic-button')).toBeVisible()

    // Click Add Topic
    await page.getByTestId('review-add-topic-button').click()

    // Wait for the second topic row's search input to appear and be focused
    const searchInputs = page.getByTestId('topic-autocomplete-input')
    await expect(searchInputs).toHaveCount(2)
    await expect(searchInputs.nth(1)).toBeFocused()
  })
})
