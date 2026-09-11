import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  scrollToLoadMore,
  forceMainScrollableBeforeHydration,
} from '../../helpers/scroll-to-load-more.mts'

test.describe('Post search and pagination', () => {
  test.use({ storageState: AUTH_STATE })

  test.describe('search', () => {
    test('search input submits and updates URL with q param', async ({ page }) => {
      await navigateTo(page, '/posts')
      await waitForBelowFoldHydration(page)

      const searchInput = page.getByTestId('list-filters-search-input')
      await searchInput.pressSequentially('voucha')
      await searchInput.press('Enter')

      await expect(page).toHaveURL(/q=voucha/)
    })

    test('search on /articles keeps post type in URL', async ({ page }) => {
      await navigateTo(page, '/articles')
      await waitForBelowFoldHydration(page)

      const searchInput = page.getByTestId('list-filters-search-input')
      await searchInput.pressSequentially('credit')
      await searchInput.press('Enter')

      await expect(page).toHaveURL(/\/articles\?/)
      await expect(page).toHaveURL(/q=credit/)
    })

    test('clearing search removes q from URL', async ({ page }) => {
      await navigateTo(page, '/posts?q=test&sort=relevance')
      await waitForBelowFoldHydration(page)

      const searchInput = page.getByTestId('list-filters-search-input')
      await searchInput.clear()
      await searchInput.press('Enter')

      await expect(page).not.toHaveURL(/q=/)
    })
  })

  test.describe('infinite scroll', () => {
    test('shows load-more control when more results are available', async ({ page }) => {
      await navigateTo(page, '/posts?sort=new')

      await expect(page.getByTestId('post-card-root').first()).toBeVisible()
      await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()
      await expect(page.getByTestId('paginated-list-continuation')).toBeVisible()
    })

    test('does not crash on scroll and loads next page when available', async ({ page }) => {
      // Force the page taller than the viewport before hydration so InfiniteScroll's
      // short-page escape hatch cannot auto-load the next page on its own — this test
      // must exercise the scroll-gated path, not the escape hatch.
      await forceMainScrollableBeforeHydration(page)
      await navigateTo(page, '/posts?sort=new')

      const cards = page.getByTestId('post-card-root')
      await expect(cards.first()).toBeVisible()
      const initialCards = await cards.count()
      expect(initialCards).toBeGreaterThan(0)

      const nextPageResponse = page.waitForResponse(
        response =>
          response.url().includes('/api/v1/posts') &&
          response.status() === 200 &&
          new URL(response.url()).searchParams.has('after'),
      )

      await scrollToLoadMore(page)
      await nextPageResponse
      await expect.poll(() => cards.count()).toBeGreaterThan(initialCards)
    })
  })

  test.describe('post type URL enforcement', () => {
    test('/articles only shows article-type posts', async ({ page }) => {
      await navigateTo(page, '/articles')

      const main = page.locator('main')
      await expect(main.getByTestId('post-card-type-badge-review')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-discussion')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-blog_post')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-data_point')).toHaveCount(0)
    })

    test('/blog only shows blog_post-type posts', async ({ page }) => {
      await navigateTo(page, '/blog')

      const main = page.locator('main')
      await expect(main.getByTestId('post-card-type-badge-article')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-review')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-discussion')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-data_point')).toHaveCount(0)
    })

    test('/reviews only shows review-type posts', async ({ page }) => {
      await navigateTo(page, '/reviews')

      const main = page.locator('main')
      await expect(main.getByTestId('post-card-type-badge-article')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-discussion')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-blog_post')).toHaveCount(0)
      await expect(main.getByTestId('post-card-type-badge-data_point')).toHaveCount(0)
    })
  })

  test.describe('ListFilters DOM order', () => {
    test('submit button appears after sort trigger in DOM order', async ({ page }) => {
      await navigateTo(page, '/posts')
      await waitForBelowFoldHydration(page)

      await expect(page.getByTestId('list-filters-sort-trigger')).toBeVisible()
      await expect(page.getByTestId('list-filters-search-submit')).toBeVisible()

      const submitFollowsSort = await page.evaluate(() => {
        const sort = document.querySelector('[data-pw="list-filters-sort-trigger"]')
        const submit = document.querySelector('[data-pw="list-filters-search-submit"]')
        if (!sort || !submit) return false
        return !!(sort.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING)
      })
      expect(submitFollowsSort).toBe(true)
    })
  })

  test.describe('sort and search interaction', () => {
    test('Relevance sort appears when search is active', async ({ page }) => {
      await navigateTo(page, '/posts')
      await waitForBelowFoldHydration(page)

      await page.getByTestId('list-filters-sort-trigger').press(' ')
      await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeHidden()
      await page.keyboard.press('Escape')

      // Search
      const searchInput = page.getByTestId('list-filters-search-input')
      await searchInput.pressSequentially('test')
      await searchInput.press('Enter')

      await expect(page).toHaveURL(/sort=relevance/)
      await page.getByTestId('list-filters-sort-trigger').press(' ')
      await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeVisible()
    })
  })

  test.describe('signed-in pagination', () => {
    test('authenticated user sees posts on /posts', async ({ page }) => {
      await navigateTo(page, '/posts')

      await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('All')
      // Should not have public cache-control headers (verified in backend tests)
    })

    test('authenticated user can search posts', async ({ page }) => {
      await navigateTo(page, '/posts')
      await waitForBelowFoldHydration(page)

      const searchInput = page.getByTestId('list-filters-search-input')
      await searchInput.pressSequentially('voucha')
      await searchInput.press('Enter')

      await expect(page).toHaveURL(/q=voucha/)
      await expect(page).toHaveURL(/sort=relevance/)
    })
  })
})
