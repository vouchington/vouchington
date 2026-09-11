import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { storybookBundleHasStory } from '../../helpers/storybook.mts'

// Status page data-pw attributes are accessible in the actual web app routes (e.g. 404)
// and in Storybook stories. The global-error/error boundaries are triggered by SSR-side
// API failures, which cannot be injected via page.route() since server-to-backend requests
// bypass the browser network stack. They are verified via Vitest unit tests and Storybook.

const currentBundleSentinelStory = 'design-system-shared-statuspage--not-found'

async function skipIfStorybookBundleIsStale(page: Parameters<typeof navigateTo>[0]) {
  test.skip(
    !(await storybookBundleHasStory(page, currentBundleSentinelStory)),
    'Full-stack Storybook bundle predates this story.',
  )
}

async function openStory(page: Parameters<typeof navigateTo>[0], id: string) {
  await navigateTo(page, `/storybook/iframe.html?id=${id}&viewMode=story`)
}

test.describe('status page and error page rendering', () => {
  test('404 route renders StatusPage with correct data-pw attributes', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-404-check')
    expect(response?.status()).toBe(404)

    await expect(page.getByTestId('status-page-title')).toBeVisible()
    await expect(page.getByTestId('status-page-title')).toContainText('Page not found')
    await expect(page.getByTestId('status-page-description')).toBeVisible()
    await expect(page.getByTestId('status-page-home-link')).toHaveAttribute('href', '/')
  })

  test('StatusPage storybook story renders rate-limited variant', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-shared-statuspage--rate-limited')

    await expect(page.getByTestId('status-page-title')).toContainText('Too many requests')
    await expect(page.getByTestId('status-page-description')).toContainText(
      'sending requests too quickly',
    )
    await expect(page.getByTestId('status-page-home-link')).toBeVisible()
  })

  test('ErrorPage storybook story renders rate-limited variant', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-shared-errorpage--rate-limited')

    await expect(page.getByTestId('error-page')).toBeVisible()
    await expect(page.getByTestId('error-page-title')).toContainText('Too many requests')
    await expect(page.getByTestId('error-page-description')).toContainText(
      'sending requests too quickly',
    )
    await expect(page.getByTestId('error-page-retry-button')).toBeVisible()
    await expect(page.getByTestId('error-page-home-link')).toHaveAttribute('href', '/')
  })

  test('ErrorPage storybook story renders generic error variant', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-shared-errorpage--generic-error')

    await expect(page.getByTestId('error-page-title')).toContainText('Something went wrong')
    await expect(page.getByTestId('error-page-retry-button')).toBeVisible()
  })

  test('GlobalError storybook story renders rate-limited variant', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-shared-errorpage--global-error-rate-limited')

    await expect(page.getByTestId('global-error-page')).toBeVisible()
    await expect(page.getByTestId('global-error-page-title')).toContainText('Too many requests')
    await expect(page.getByTestId('global-error-page-description')).toContainText(
      'sending requests too quickly',
    )
    await expect(page.getByTestId('global-error-page-retry-button')).toBeVisible()
    await expect(page.getByTestId('global-error-page-home-link')).toHaveAttribute('href', '/')
  })

  test('GlobalError storybook story renders generic error variant', async ({ page }) => {
    await skipIfStorybookBundleIsStale(page)
    await openStory(page, 'design-system-shared-errorpage--global-error-generic')

    await expect(page.getByTestId('global-error-page-title')).toContainText('Something went wrong')
    await expect(page.getByTestId('global-error-page-retry-button')).toBeVisible()
  })
})
