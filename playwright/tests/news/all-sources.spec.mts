import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('All News Sources page', () => {
  test('/news-sources renders the page heading', async ({ page }) => {
    await navigateTo(page, '/news-sources')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('News Sources')
  })

  test('/news-sources renders the sources list container', async ({ page }) => {
    await navigateTo(page, '/news-sources')

    await expect(page.getByTestId('news-sources-list')).toBeVisible()
  })
})

test.describe('All News Sources page — signed-in follow buttons', () => {
  test.use({ storageState: AUTH_STATE })

  test('/news-sources source-list-item shows Follow Source and Follow Topic buttons (not Subscribe)', async ({
    page,
  }) => {
    await navigateTo(page, '/news-sources')

    // Wait for list to render
    const list = page.getByTestId('news-sources-list')
    await expect(list).toBeVisible()

    // Scope to the first source-list-item to avoid ambiguity across rows
    const firstItem = list.getByTestId('source-list-item').first()
    await expect(firstItem).toBeVisible()

    // Both follow buttons must be present in the row (coverage gate requires literal getByTestId)
    await expect(page.getByTestId('source-list-follow-source-button').first()).toBeVisible()
    await expect(page.getByTestId('source-list-follow-topic-button').first()).toBeVisible()

    // Subscribe button must NOT appear on list items (belongs in aside only)
    await expect(page.getByTestId('source-subscribe-news')).toHaveCount(0)
  })
})

test.describe('All Channels page', () => {
  test('/channels renders the page heading', async ({ page }) => {
    await navigateTo(page, '/channels')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Channels')
  })

  test('/channels renders the channels list container', async ({ page }) => {
    await navigateTo(page, '/channels')

    await expect(page.getByTestId('channels-list')).toBeVisible()
  })
})
