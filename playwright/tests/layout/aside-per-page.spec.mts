import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { followTopicById } from '../../../backend/test-helpers/index.mts'

const LG_VIEWPORT = { width: 1024, height: 768 }
const CHASE_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'

test.describe('Per-page aside content — logged out', () => {
  test('/discussions (post listing) has About Voucha aside and no embedded login form', async ({
    page,
  }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside.getByTestId('aside-accordion-about-voucha-trigger')).toBeVisible()
    // Verify the aside has no embedded login form
    await expect(aside.getByTestId('login-email-input')).toBeHidden()
  })

  test('/discussions (post listing) shows TrendingTopicsAside when data exists', async ({
    page,
  }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    const trendingHeading = aside.getByTestId('trending-topics-aside-heading')

    await expect(
      trendingHeading,
      'seeded current-window trending topics should be visible',
    ).toBeVisible()
  })

  test('/plans (marketing) has About Voucha accordion', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/plans')

    const aside = page.locator('main aside')
    const trigger = aside.getByTestId('aside-accordion-about-voucha-trigger')
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

test.describe('Per-page aside content — logged in', () => {
  test.use({ storageState: AUTH_STATE })

  test('/feed/posts (feed) has ConnectSocialAside', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/feed/posts')

    // Clear dismissal to ensure the aside is visible
    await page.evaluate(() => localStorage.removeItem('aside-connect-social'))
    await page.reload()

    const aside = page.locator('main aside')
    await expect(aside.getByTestId('connect-social-aside-content-heading')).toBeVisible()
  })

  test('/my/profile (settings) has About Voucha accordion', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/my/profile')

    const aside = page.locator('main aside')
    // AboutVouchaAside is always present in the (my) layout
    const trigger = aside.getByTestId('aside-accordion-about-voucha-trigger')
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  test('/my/profile (settings) shows ConnectSocialAside when accounts not linked', async ({
    page,
  }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/my/profile')

    // Clear dismissal so ConnectSocialAside is visible if applicable
    await page.evaluate(() => localStorage.removeItem('aside-connect-social'))
    await page.reload()

    const aside = page.locator('main aside')
    const connectHeading = aside.getByTestId('connect-social-aside-content-heading')

    await expect(
      connectHeading,
      'test user should have fewer than 3 connected OAuth accounts',
    ).toBeVisible()
  })
})

test.describe('Per-page aside content — fresh user', () => {
  test('/feed/posts (feed) has PopularCommunitiesAside for users without community memberships', async ({
    page,
  }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await withCleanUser(page)
    await navigateTo(page, '/feed/posts')

    const aside = page.locator('main aside')
    const communities = aside.getByTestId('aside-accordion-communities')
    const trigger = aside.getByTestId('aside-accordion-communities-trigger')

    await expect(communities).toBeVisible()
    await expect(
      trigger,
      'communities accordion visible for user with no memberships',
    ).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(aside.getByTestId('popular-communities-browse-link')).toBeVisible()
  })

  test('/topics recommends American Express Gold to a user following Chase Sapphire Preferred', async ({
    page,
  }) => {
    await page.setViewportSize(LG_VIEWPORT)
    const freshUser = await withCleanUser(page)
    await followTopicById(freshUser.id, CHASE_TOPIC_ID)
    await navigateTo(page, '/topics')

    const aside = page.locator('main aside')
    await expect(aside.getByTestId('recommended-topics-aside-heading')).toBeVisible()
    await expect(
      aside.locator('a').filter({ hasText: 'American Express Gold' }).first(),
    ).toBeVisible()
    await expect(aside.getByTestId('recommended-topics-aside-dismissed-link')).toHaveAttribute(
      'href',
      '/my/topics/dismissed-recommendations',
    )
  })
})
