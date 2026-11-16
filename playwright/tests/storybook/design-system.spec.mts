import { expect, test } from '../../helpers/test.mts'
import { navigateTo, storybookBundleHasStory } from 'vouchington-tooling/playwright'

const currentBundleSentinelStory = 'design-system-components-card--default'

async function requireCurrentStorybookBundle(page: Parameters<typeof navigateTo>[0]) {
  expect(
    await storybookBundleHasStory(page, currentBundleSentinelStory),
    `Storybook bundle is missing ${currentBundleSentinelStory}.`,
  ).toBe(true)
}

async function openStory(page: Parameters<typeof navigateTo>[0], id: string) {
  // Each story load fetches ~150 same-origin assets. Wait for `load` and let the web-first
  // assertion on the rendered story be the readiness signal instead of `networkidle`.
  await navigateTo(page, `/storybook/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' })
}

test.describe('Storybook design system component stories', () => {
  test('renders alert components', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-alert--variants')

    await expect(page.getByTestId('alert').first()).toBeVisible()
    await expect(page.getByTestId('alert-title').first()).toBeVisible()
    await expect(page.getByTestId('alert-description').first()).toBeVisible()
  })

  test('renders keyboard key primitives', async ({ page }) => {
    expect(
      await storybookBundleHasStory(page, 'design-system-components-kbd--shortcuts'),
      'Storybook bundle is missing design-system-components-kbd--shortcuts.',
    ).toBe(true)
    await openStory(page, 'design-system-components-kbd--shortcuts')

    await expect(page.getByTestId('kbd-group')).toBeVisible()
    await expect(page.getByTestId('kbd').first()).toBeVisible()
  })

  test('renders badge primitives', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-badge--variants')
    await expect(page.getByTestId('badge').first()).toBeVisible()
  })

  test('renders button primitives', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-button--variants')
    await expect(page.getByTestId('button').first()).toBeVisible()
  })

  test('renders card primitives', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-card--default')
    await expect(page.getByTestId('card')).toBeVisible()
    await expect(page.getByTestId('card-header')).toBeVisible()
    await expect(page.getByTestId('card-title')).toBeVisible()
    await expect(page.getByTestId('card-description')).toBeVisible()
    await expect(page.getByTestId('card-content')).toBeVisible()
  })

  test('renders shared link', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-textlink--default')
    await expect(page.getByTestId('text-link')).toBeVisible()
    await expect(page.getByTestId('text-link-anchor')).toHaveCount(2)
  })

  test('renders tooltip button', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-button--with-tooltip')
    await expect(page.getByTestId('tooltip-button')).toHaveCount(2)
  })

  test('renders skeleton', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-skeleton--skeleton')
    await expect(page.getByTestId('skeleton').first()).toBeVisible()
  })

  test('renders empty state', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-components-emptystate--default')
    await expect(page.getByTestId('empty-state')).toBeVisible()
  })

  test('renders feed category chips', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--category-chips-default')
    await expect(page.getByTestId('category-chips')).toBeVisible()
    await expect(page.getByTestId('category-chip').first()).toBeVisible()
  })

  test('renders feed header', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--feed-header-default')
    await expect(page.getByTestId('feed-page-heading')).toBeVisible()
  })

  test('renders feed posts top section', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--feed-posts-top-section')
    await expect(page.getByTestId('feed-top-section')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')
  })

  test('renders feed news top section', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--feed-news-top-section')
    await expect(page.getByTestId('feed-top-section')).toBeVisible()
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Following')
  })

  test('renders all posts top section', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--all-posts-top-section')
    await expect(page.getByTestId('post-list-top-section')).toBeVisible()
    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('All')
  })

  test('renders reviews top section', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--reviews-top-section')
    await expect(page.getByTestId('post-list-top-section')).toBeVisible()
    await expect(page.getByTestId('post-type-title-dropdown-trigger')).toContainText('Reviews')
  })

  test('renders feed skeleton', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-feed--feed-skeleton-default')
    await expect(page.getByTestId('feed-skeleton')).toBeVisible()
  })

  test('renders hoverable card', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-layout--hoverable-card-default')
    await expect(page.getByTestId('hoverable-card')).toBeVisible()
  })

  test('renders user avatar', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-media--user-avatar-default')
    await expect(page.getByTestId('user-avatar').first()).toBeVisible()
  })

  test('renders post image', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-media--post-image-default')
    await expect(page.getByTestId('post-image')).toBeVisible()
  })

  test('renders structured data script', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-seo--structured-data-script-default')
    await expect(page.getByTestId('structured-data-script')).toBeAttached()
  })

  test('renders brand logo marks', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'design-system-brand--logo-marks')
    await expect(page.getByTestId('voucha-logo')).toBeVisible()
  })

  test('renders community list item card', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'entities-communities--list-item-card')
    await expect(page.getByTestId('community-list-item-card')).toBeVisible()
  })

  test('renders source list item', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'entities-sources--list-page')
    await expect(page.getByTestId('source-list-item').first()).toBeVisible()
  })

  test('renders news item header', async ({ page }) => {
    await requireCurrentStorybookBundle(page)
    await openStory(page, 'entities-news-and-rss-items--news-item-header-default')
    await expect(page.getByTestId('news-item-header')).toBeVisible()
  })

  test('renders user profile link components', async ({ page }) => {
    await requireCurrentStorybookBundle(page)

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
