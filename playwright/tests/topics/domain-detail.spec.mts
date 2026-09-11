import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

// Seeded hostname from playwright-test-data.mts — example.com with a crawler attached
const SEEDED_HOSTNAME = 'example.com'

test.describe('Domain Detail Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('anonymous viewer: domain detail renders heading', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    await expect(page.getByTestId('domain-detail-heading')).toHaveText(SEEDED_HOSTNAME)
  })

  test('anonymous viewer: no admin tab visible', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    // Anonymous users see no domain Menubar — admin items only appear for administrators
    await expect(page.getByTestId('domain-tab-overview')).toHaveCount(0)
  })

  test('admin viewer: domain actions aside shows mute, block, and report', async ({ page }) => {
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    await expect(page.getByTestId('domain-actions-aside')).toBeVisible()
    await expect(page.getByTestId('domain-mute-button')).toBeVisible()
    await expect(page.getByTestId('domain-block-button')).toBeVisible()
    await expect(page.getByTestId('report-inline-button')).toBeVisible()
  })

  test('admin viewer: Moderation and Crawlers Menubar items are visible', async ({ page }) => {
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    await expect(page.getByTestId('domain-detail-heading')).toHaveText(SEEDED_HOSTNAME)

    // Moderation and Crawlers items should be visible
    await expect(page.getByTestId('domain-tab-moderation')).toBeVisible()
    await expect(page.getByTestId('domain-tab-crawlers')).toBeVisible()

    // Overview tab is the default
    await expect(page.getByTestId('domain-tab-overview')).toBeVisible()

    // Click Moderation tab — moderation controls should appear
    await page.getByTestId('domain-tab-moderation').click()
    await expect(page.getByTestId('hostname-moderation-controls')).toBeVisible()
  })
})
