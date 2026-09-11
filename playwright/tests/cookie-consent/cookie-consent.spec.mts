import { navigateTo } from '../../helpers/navigate-to.mts'
import { test, expect } from '../../helpers/test.mts'

// GTM only loads when NEXT_PUBLIC_GTM_ID is configured
const hasGtmId = Boolean(process.env.NEXT_PUBLIC_GTM_ID)

test.describe('Cookie Consent Banner', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test so banner always shows on fresh visit
    await page.addInitScript(() => {
      localStorage.removeItem('cookie-consent')
    })
  })

  test('banner appears on first visit with no consent stored, GTM not loaded', async ({ page }) => {
    await navigateTo(page, '/')

    const banner = page.getByTestId('cookie-consent-banner')
    await expect(banner).toBeVisible()

    await expect(page.getByTestId('cookie-consent-accept-all-button')).toBeVisible()
    await expect(page.getByTestId('cookie-consent-essential-only-button')).toBeVisible()

    // GTM script should not be injected when no consent
    const gtmScript = page.locator('script[src*="gtm.js"]')
    await expect(gtmScript).toHaveCount(0)
  })

  test('after clicking Accept All, banner disappears and consent is stored', async ({ page }) => {
    await navigateTo(page, '/')

    const banner = page.getByTestId('cookie-consent-banner')
    await expect(banner).toBeVisible()

    await page.getByTestId('cookie-consent-accept-all-button').click()

    // Banner should disappear
    await expect(banner).toBeHidden()

    // Consent stored in localStorage
    const consent = await page.evaluate(() => localStorage.getItem('cookie-consent'))
    expect(consent).toBe('all')
  })

  test('GTM script loads after accepting all cookies', async ({ page }) => {
    test.skip(!hasGtmId, 'Requires NEXT_PUBLIC_GTM_ID to be configured')

    await navigateTo(page, '/')

    await page.getByTestId('cookie-consent-accept-all-button').click()

    // GTM script injected after consent
    await page.waitForFunction(() => document.querySelector('script[src*="gtm.js"]') !== null)
    const gtmScript = page.locator('script[src*="gtm.js"]')
    await expect(gtmScript).toHaveCount(1)
  })

  test('after clicking Essential Only, GTM stays unloaded and banner disappears', async ({
    page,
  }) => {
    await navigateTo(page, '/')

    const banner = page.getByTestId('cookie-consent-banner')
    await expect(banner).toBeVisible()

    await page.getByTestId('cookie-consent-essential-only-button').click()

    // Banner should disappear
    await expect(banner).toBeHidden()

    // Consent stored as essential
    const consent = await page.evaluate(() => localStorage.getItem('cookie-consent'))
    expect(consent).toBe('essential')

    // GTM script should NOT be injected
    const gtmScript = page.locator('script[src*="gtm.js"]')
    await expect(gtmScript).toHaveCount(0)
  })

  test('banner does not appear when consent already set', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cookie-consent', 'all')
    })

    await navigateTo(page, '/')

    const banner = page.getByTestId('cookie-consent-banner')
    await expect(banner).toBeHidden()
  })
})
