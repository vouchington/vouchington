import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }

test.describe('Bookmarks pages', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('/my/posts/saved page renders', async ({ page }) => {
    await navigateTo(page, '/my/posts/saved')
    await expect(page.getByTestId('my-posts-saved-page')).toBeVisible()
  })

  test('/my/posts/hidden page renders', async ({ page }) => {
    await navigateTo(page, '/my/posts/hidden')
    await expect(page.getByTestId('my-posts-hidden-page')).toBeVisible()
  })

  test('/my/posts/following page renders', async ({ page }) => {
    await navigateTo(page, '/my/posts/following')
    await expect(page.getByTestId('my-posts-following-page')).toBeVisible()
  })

  test('/my/posts/subscribed page renders', async ({ page }) => {
    await navigateTo(page, '/my/posts/subscribed')
    await expect(page.getByTestId('my-posts-subscribed-page')).toBeVisible()
  })

  test('/my/topics/blocked page renders', async ({ page }) => {
    await navigateTo(page, '/my/topics/blocked')
    await expect(page.getByTestId('my-topics-blocked-page')).toBeVisible()
  })

  test('/my/topics/following page renders', async ({ page }) => {
    await navigateTo(page, '/my/topics/following')
    await expect(page.getByTestId('my-topics-following-page')).toBeVisible()
  })

  test('/my/topics/muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/topics/muted')
    await expect(page.getByTestId('my-topics-muted-page')).toBeVisible()
  })

  test('topic relation list items show management action, not in-card bookmark buttons', async ({
    page,
  }) => {
    await navigateTo(page, '/my/topics/muted')
    // Wait for full page render before checking item count.
    await expect(page.getByTestId('my-topics-muted-page')).toBeVisible()
    const items = page.getByTestId('topic-card')
    const count = await items.count()
    expect(count).toBeGreaterThan(0)
    // Management action is the sole bookmark control; Follow/Mute suppressed via hideBookmarkActions.
    await expect(page.getByTestId('relation-management-action').first()).toBeVisible()
    await expect(items.first().getByTestId('follow-button')).toHaveCount(0)
  })

  test('/my/topics/dismissed-recommendations page renders', async ({ page }) => {
    await navigateTo(page, '/my/topics/dismissed-recommendations')
    await expect(page.getByTestId('my-topics-dismissed-recommendations-page')).toBeVisible()
  })

  test('/my/topics/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/topics/viewed')
    await expect(page.getByTestId('my-topics-viewed-page')).toBeVisible()
  })

  test('/my/domains/muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/domains/muted')
    await expect(page.getByTestId('my-domains-muted-page')).toBeVisible()
  })

  test('/my/domains/blocked page renders', async ({ page }) => {
    await navigateTo(page, '/my/domains/blocked')
    await expect(page.getByTestId('my-domains-blocked-page')).toBeVisible()
  })

  test('/my/urls/saved page renders', async ({ page }) => {
    await navigateTo(page, '/my/urls/saved')
    await expect(page.getByTestId('my-urls-saved-page')).toBeVisible()
  })

  test('/my/communities/saved page renders', async ({ page }) => {
    await navigateTo(page, '/my/communities/saved')
    await expect(page.getByTestId('my-communities-saved-page')).toBeVisible()
  })

  test('/my/communities/proxy-following page renders', async ({ page }) => {
    await navigateTo(page, '/my/communities/proxy-following')
    await expect(page.getByTestId('my-communities-proxy-following-page')).toBeVisible()
  })

  test('/my/communities/proxy-muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/communities/proxy-muted')
    await expect(page.getByTestId('my-communities-proxy-muted-page')).toBeVisible()
  })

  test('/my/users/following page renders', async ({ page }) => {
    await navigateTo(page, '/my/users/following')
    await expect(page.getByTestId('my-users-following-page')).toBeVisible()
  })

  test('/my/users/followers page renders', async ({ page }) => {
    await navigateTo(page, '/my/users/followers')
    await expect(page.getByTestId('my-users-followers-page')).toBeVisible()
  })

  test('/my/users/subscribed-posts page renders', async ({ page }) => {
    await navigateTo(page, '/my/users/subscribed-posts')
    await expect(page.getByTestId('my-users-subscribed-posts-page')).toBeVisible()
  })

  test('/my/users/muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/users/muted')
    await expect(page.getByTestId('my-users-muted-page')).toBeVisible()
  })

  test('/my/users/blocked page renders', async ({ page }) => {
    await navigateTo(page, '/my/users/blocked')
    await expect(page.getByTestId('my-users-blocked-page')).toBeVisible()
  })

  test('/my/users/dismissed-recommendations page renders', async ({ page }) => {
    await navigateTo(page, '/my/users/dismissed-recommendations')
    // redirects to /my/friend-recommendations/dismissed
    await expect(page.getByTestId('find-friends-dismissed-page')).toBeVisible()
  })

  test('/my/news-items/saved page renders with type filter', async ({ page }) => {
    await navigateTo(page, '/my/news-items/saved')
    await expect(page.getByTestId('my-news-items-saved-page')).toBeVisible()
    await expect(page.getByTestId('rss-bookmark-type-filter')).toBeVisible()
  })

  test('/my/news-items/hidden page renders', async ({ page }) => {
    await navigateTo(page, '/my/news-items/hidden')
    await expect(page.getByTestId('my-news-items-hidden-page')).toBeVisible()
  })

  test('/my/news-items/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/news-items/viewed')
    await expect(page.getByTestId('my-news-items-viewed-page')).toBeVisible()
  })

  test('/my/news-sources/muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/news-sources/muted')
    await expect(page.getByTestId('my-news-sources-muted-page')).toBeVisible()
  })

  test('/my/news-sources/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/news-sources/viewed')
    await expect(page.getByTestId('my-news-sources-viewed-page')).toBeVisible()
  })

  test('/my/podcast-episodes/saved page renders', async ({ page }) => {
    await navigateTo(page, '/my/podcast-episodes/saved')
    await expect(page.getByTestId('my-podcast-episodes-saved-page')).toBeVisible()
  })

  test('/my/podcast-episodes/hidden page renders', async ({ page }) => {
    await navigateTo(page, '/my/podcast-episodes/hidden')
    await expect(page.getByTestId('my-podcast-episodes-hidden-page')).toBeVisible()
  })

  test('/my/podcast-episodes/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/podcast-episodes/viewed')
    await expect(page.getByTestId('my-podcast-episodes-viewed-page')).toBeVisible()
  })

  test('/my/podcasts/muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/podcasts/muted')
    await expect(page.getByTestId('my-podcasts-muted-page')).toBeVisible()
  })

  test('/my/podcasts/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/podcasts/viewed')
    await expect(page.getByTestId('my-podcasts-viewed-page')).toBeVisible()
  })

  test('/my/videos/saved page renders', async ({ page }) => {
    await navigateTo(page, '/my/videos/saved')
    await expect(page.getByTestId('my-videos-saved-page')).toBeVisible()
  })

  test('/my/videos/hidden page renders', async ({ page }) => {
    await navigateTo(page, '/my/videos/hidden')
    await expect(page.getByTestId('my-videos-hidden-page')).toBeVisible()
  })

  test('/my/videos/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/videos/viewed')
    await expect(page.getByTestId('my-videos-viewed-page')).toBeVisible()
  })

  test('/my/channels/muted page renders', async ({ page }) => {
    await navigateTo(page, '/my/channels/muted')
    await expect(page.getByTestId('my-channels-muted-page')).toBeVisible()
  })

  test('/my/channels/viewed page renders', async ({ page }) => {
    await navigateTo(page, '/my/channels/viewed')
    await expect(page.getByTestId('my-channels-viewed-page')).toBeVisible()
  })
})
