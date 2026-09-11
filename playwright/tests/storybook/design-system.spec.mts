import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { storybookBundleHasStory } from '../../helpers/storybook.mts'

const currentBundleSentinelStory = 'design-system-layout--sidebar-menu-skeleton-default'

async function skipIfStorybookBundleIsStale(page: Parameters<typeof navigateTo>[0]) {
  test.skip(
    !(await storybookBundleHasStory(page, currentBundleSentinelStory)),
    'Full-stack Storybook bundle predates this design system story sweep.',
  )
}

async function openStory(page: Parameters<typeof navigateTo>[0], id: string) {
  await navigateTo(page, `/storybook/iframe.html?id=${id}&viewMode=story`)
}

test.describe('Storybook design system component stories', () => {
  test('renders alert components', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-components-alert--variants')

    await expect(page.getByTestId('alert').first()).toBeVisible()
    await expect(page.getByTestId('alert-title').first()).toBeVisible()
    await expect(page.getByTestId('alert-description').first()).toBeVisible()
  })

  test('renders badge, button, and card primitives', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'design-system-components-badge--variants')
    await expect(page.getByTestId('badge').first()).toBeVisible()

    await openStory(page, 'design-system-components-button--variants')
    await expect(page.getByTestId('button').first()).toBeVisible()

    await openStory(page, 'design-system-components-card--default')
    await expect(page.getByTestId('card')).toBeVisible()
    await expect(page.getByTestId('card-header')).toBeVisible()
    await expect(page.getByTestId('card-title')).toBeVisible()
    await expect(page.getByTestId('card-description')).toBeVisible()
    await expect(page.getByTestId('card-content')).toBeVisible()
    await expect(page.getByTestId('card-footer')).toBeVisible()
  })

  test('renders skeleton and empty state', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'design-system-components-skeleton--skeleton')
    await expect(page.getByTestId('skeleton').first()).toBeVisible()

    await openStory(page, 'design-system-components-empty-state--default')
    await expect(page.getByTestId('empty-state')).toBeVisible()
  })

  test('renders feed components', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'design-system-feed--category-chips-default')
    await expect(page.getByTestId('category-chips')).toBeVisible()
    await expect(page.getByTestId('category-chip').first()).toBeVisible()

    await openStory(page, 'design-system-feed--feed-header-default')
    await expect(page.getByTestId('feed-page-heading')).toBeVisible()

    await openStory(page, 'design-system-feed--feed-posts-top-section')
    await expect(page.getByTestId('feed-top-section')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')

    await openStory(page, 'design-system-feed--feed-news-top-section')
    await expect(page.getByTestId('feed-top-section')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')

    await openStory(page, 'design-system-feed--all-posts-top-section')
    await expect(page.getByTestId('post-list-top-section')).toBeVisible()
    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('All')

    await openStory(page, 'design-system-feed--reviews-top-section')
    await expect(page.getByTestId('post-list-top-section')).toBeVisible()
    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('Reviews')

    await openStory(page, 'design-system-feed--feed-skeleton-default')
    await expect(page.getByTestId('feed-skeleton')).toBeVisible()
  })

  test('renders layout, media, brand, and SEO components', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'design-system-layout--hoverable-card-default')
    await expect(page.getByTestId('hoverable-card')).toBeVisible()

    await openStory(page, 'design-system-layout--sidebar-menu-skeleton-default')
    await expect(page.getByTestId('sidebar-menu-skeleton')).toBeVisible()

    await openStory(page, 'design-system-media--user-avatar-default')
    await expect(page.getByTestId('user-avatar').first()).toBeVisible()

    await openStory(page, 'design-system-media--post-image-default')
    await expect(page.getByTestId('post-image')).toBeVisible()

    await openStory(page, 'design-system-seo--structured-data-script-default')
    await expect(page.getByTestId('structured-data-script')).toBeAttached()

    await openStory(page, 'design-system-brand--logo-marks')
    await expect(page.getByTestId('voucha-logo')).toBeVisible()
    await expect(page.getByTestId('voucha-icon')).toBeVisible()
  })

  test('renders entity list item components', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'entities-communities--list-item-card')
    await expect(page.getByTestId('community-list-item-card')).toBeVisible()

    await openStory(page, 'entities-sources--list-page')
    await expect(page.getByTestId('source-list-item').first()).toBeVisible()

    await openStory(page, 'entities-news-and-rss-items--news-item-header-default')
    await expect(page.getByTestId('news-item-header')).toBeVisible()
  })

  test('renders user profile link components', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)

    await openStory(page, 'entities-users--profile-links')
    await expect(page.getByTestId('profile-link-badge').first()).toBeVisible()
    await expect(page.getByTestId('profile-link-icons')).toBeVisible()
    const iconTargets = page.getByTestId('profile-link-icons').locator('a')
    await expect(iconTargets).toHaveCount(2)

    const boxes = await iconTargets.evaluateAll(links =>
      links.map(link => {
        const rect = link.getBoundingClientRect()
        return { x: rect.x, width: rect.width, height: rect.height }
      }),
    )
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    const sortedBoxes = [...boxes].toSorted((a, b) => a.x - b.x)
    expect(sortedBoxes[1]!.x).toBeGreaterThanOrEqual(sortedBoxes[0]!.x + sortedBoxes[0]!.width)
  })
})
