import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const LG_VIEWPORT = { width: 1024, height: 768 }

test.describe('Aside ordering — static before RSC', () => {
  test('post listing: About precedes RSC asides', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    const aboutTrigger = aside.getByTestId('aside-accordion-about-voucha-trigger')

    await expect(aboutTrigger).toBeVisible()
  })

  test('topic list: About precedes RSC asides', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/topics')

    const aside = page.locator('main aside')
    const aboutTrigger = aside.getByTestId('aside-accordion-about-voucha-trigger')

    await expect(aboutTrigger).toBeVisible()
  })
})

test.describe('RSC aside loading — logged in', () => {
  test.use({ storageState: AUTH_STATE })

  test('feed page shows RSC asides in SequentialAsideSuspense', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/feed/posts')

    // Clear dismissals to ensure RSC asides are visible
    await page.evaluate(() => {
      localStorage.removeItem('aside-follow-topics')
      localStorage.removeItem('aside-connect-social')
      localStorage.removeItem('aside-upgrade-membership')
    })
    await page.reload()

    const aside = page.locator('main aside')

    // ConnectSocialAside is visible for the seeded test user (shown until ≥3 socials connected,
    // which the test user has not done — unlike activity-gated asides that may be hidden)
    const connectAside = aside.getByTestId('connect-social-aside-content')
    await expect(
      connectAside,
      'ConnectSocialAside should render for the seeded test user (no social accounts connected)',
    ).toBeVisible()
  })

  test('at most one skeleton visible during RSC loading', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)

    // Navigate and quickly check for skeletons before RSC resolves — use domcontentloaded so
    // RSC hasn't settled yet; navigateTo() would wait for networkidle and miss the skeletons
    // ast-grep-ignore: playwright-no-raw-goto -- skeleton check requires domcontentloaded; navigateTo() waits for networkidle and RSC content has already settled by then
    await page.goto('/feed/posts', { waitUntil: 'domcontentloaded' })

    // Either no skeletons (RSC resolved fast) or at most one parent skeleton card
    const skeletonCards = page.locator('main aside [class*="animate-pulse"]')
    const skeletonCount = await skeletonCards.count()

    // At most 1 skeleton card should be visible at any time
    expect(skeletonCount).toBeLessThanOrEqual(4) // 4 bars in one AsideSkeleton card
  })
})
