import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }

async function ensureSidebarOpen(page: Parameters<typeof navigateTo>[0]) {
  const sidebarPeer = page.getByTestId('sidebar-peer')
  if ((await sidebarPeer.getAttribute('data-state')) !== 'expanded') {
    await page.getByTestId('sidebar-trigger').click()
  }
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  await expect(sidebar).toBeVisible()
  return sidebar
}

test.describe('Sidebar Bookmarks groups', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/')
  })

  test('authenticated: posts intent Bookmarks group is visible with correct links', async ({
    page,
  }) => {
    await navigateTo(page, '/posts')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-posts-saved')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-posts-saved')).toHaveAttribute(
      'href',
      '/my/posts/saved',
    )
  })

  test('authenticated: topics intent Bookmarks group is visible with correct links', async ({
    page,
  }) => {
    await navigateTo(page, '/topics')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-topics-following')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-topics-following')).toHaveAttribute(
      'href',
      '/my/topics/following',
    )
  })

  test('authenticated: web-search intent Bookmarks group is visible with correct links', async ({
    page,
  }) => {
    await navigateTo(page, '/domains')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-urls-saved')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-urls-saved')).toHaveAttribute(
      'href',
      '/my/urls/saved',
    )
  })

  test('authenticated: communities intent Bookmarks group is visible with correct links', async ({
    page,
  }) => {
    await navigateTo(page, '/communities')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-communities-saved')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-communities-saved')).toHaveAttribute(
      'href',
      '/my/communities/saved',
    )
    await expect(sidebar.getByTestId('sidebar-nav-my-communities-proxy-following')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-communities-proxy-following')).toHaveAttribute(
      'href',
      '/my/communities/proxy-following',
    )
    await expect(sidebar.getByTestId('sidebar-nav-my-communities-proxy-muted')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-communities-proxy-muted')).toHaveAttribute(
      'href',
      '/my/communities/proxy-muted',
    )
  })

  test('authenticated: friends intent Bookmarks group is visible with correct links', async ({
    page,
  }) => {
    await navigateTo(page, '/users')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-users-following')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-users-following')).toHaveAttribute(
      'href',
      '/my/users/following',
    )
  })

  test('authenticated: news intent shows News Bookmarks and Source Bookmarks groups', async ({
    page,
  }) => {
    await navigateTo(page, '/news')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-news-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-group-source-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-news-items-saved')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-news-items-saved')).toHaveAttribute(
      'href',
      '/my/news-items/saved',
    )
  })

  test('authenticated: podcasts intent shows Episode Bookmarks and Source Bookmarks groups', async ({
    page,
  }) => {
    await navigateTo(page, '/podcast-episodes')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-episode-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-group-source-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-podcast-episodes-saved')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-podcast-episodes-saved')).toHaveAttribute(
      'href',
      '/my/podcast-episodes/saved',
    )
  })

  test('authenticated: videos intent shows Video Bookmarks and Source Bookmarks groups', async ({
    page,
  }) => {
    await navigateTo(page, '/videos')
    const sidebar = await ensureSidebarOpen(page)
    await expect(sidebar.getByTestId('sidebar-group-video-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-group-source-bookmarks')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-videos-saved')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-nav-my-videos-saved')).toHaveAttribute(
      'href',
      '/my/videos/saved',
    )
  })
})
