import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { insertTestUrlHostname } from '../../../backend/test-helpers/index.mts'

test.describe('Domains Compare page', () => {
  let comparedHostname = ''

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    comparedHostname = `pw-compare-${randomSuffix()}.example.net`
    await insertTestUrlHostname({ hostname: comparedHostname })
  })

  test('shows trust details for a compared domain', async ({ page }) => {
    await navigateTo(page, `/domains/compare?ids=${comparedHostname}`)
    await expect(page.getByTestId('domain-trust-badge-show-details')).toBeVisible()
  })

  test('/domains/compare without IDs shows empty state', async ({ page }) => {
    await navigateTo(page, '/domains/compare')

    await expect(page.getByTestId('domains-compare-heading')).toBeVisible()

    // Without ?ids= param, shows the empty/browse state
    await expect(page.getByTestId('domains-compare-empty')).toBeVisible()
    await expect(page.getByTestId('domains-compare-browse-link')).toBeVisible()
  })

  test('/domains/compare page loads and renders breadcrumbs', async ({ page }) => {
    await navigateTo(page, '/domains/compare')

    // Page renders correctly
    await expect(page.getByTestId('domains-compare-heading')).toBeVisible()

    // Breadcrumb nav exists
    const nav = page.locator('nav[aria-label="breadcrumb"]')
    await expect(nav).toBeVisible()

    // Browse all domains link goes to /domains
    const browseLink = page.getByTestId('domains-compare-browse-link')
    await expect(browseLink).toHaveAttribute('href', '/domains')
  })
})
