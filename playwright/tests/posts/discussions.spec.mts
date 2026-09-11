import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPost } from '../../../backend/test-helpers/entities/posts.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Discussions Page', () => {
  test('should display discussions list page', async ({ page }) => {
    await navigateTo(page, '/discussions')

    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('Discussions')
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
  })

  test('/discussions combines text and hashtag topic search', async ({ page }) => {
    await navigateTo(page, '/discussions')

    const searchInput = page.getByTestId('list-filters-search-input')
    await expect(searchInput).toHaveAttribute('placeholder', 'Search by text or #topic')
    await expect(page.getByTestId('list-filters-search-submit')).toBeVisible()

    await searchInput.pressSequentially('#card')
    await expect(page.getByTestId('hashtag-topic-search-results')).toBeVisible()
    await expect(page.getByTestId('hashtag-topic-search-option').first()).toBeVisible()
    await searchInput.press('Enter')
    await expect(searchInput).toHaveValue(/#/)
  })

  test('/discussions renders user-link elements on post cards', async ({ page }) => {
    const suffix = randomSuffix()
    await insertTestPost({
      title: `Playwright discussion author ${suffix}`,
      slug: `playwright-discussion-author-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Discussion seeded for author link rendering.',
      postType: 'discussion',
    })

    await navigateTo(page, '/discussions?sort=new')

    await expect(page.getByTestId('user-link').first()).toBeVisible()
  })

  test('/discussions text search updates URL', async ({ page }) => {
    await navigateTo(page, '/discussions')

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.pressSequentially('test')
    await searchInput.press('Enter')

    await page.waitForURL(/q=test/)
    expect(page.url()).toContain('q=test')
  })

  test('search, sort dropdown, and view toggle all render at desktop viewport', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    const searchInput = page.getByTestId('list-filters-search-input')
    const sortSelect = page.getByTestId('list-filters-sort-trigger')
    const viewDropdown = page.getByTestId('post-view-toggle-trigger')

    await expect(searchInput).toBeVisible()
    await expect(sortSelect).toBeVisible()
    await expect(viewDropdown).toBeVisible()

    const searchBox = await searchInput.boundingBox()
    const sortBox = await sortSelect.boundingBox()
    const viewBox = await viewDropdown.boundingBox()

    expect(searchBox).not.toBeNull()
    expect(sortBox).not.toBeNull()
    expect(viewBox).not.toBeNull()

    expect(searchBox?.width).toBeGreaterThan(0)
    expect(sortBox?.width).toBeGreaterThan(0)
    expect(viewBox?.width).toBeGreaterThan(0)
  })
})
