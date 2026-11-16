import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

const SESSION_ROUTE = '**/api/v1/session'
const RENEWAL_URL = '/session-renewal?next=%2Fnews'

test.describe('Session renewal page', () => {
  test('shows the pending state while the browser session renews', async ({ page }) => {
    let releaseRenewal: () => void = () => undefined
    const renewalHeld = new Promise<void>(resolve => {
      releaseRenewal = resolve
    })
    await page.route(SESSION_ROUTE, async route => {
      await renewalHeld
      await route.fulfill({ status: 200, json: { session: { uid: 'renewed' } } })
    })

    await navigateTo(page, RENEWAL_URL, { waitUntil: 'load' })

    await expect(page.getByTestId('session-renewal-pending')).toBeVisible()
    releaseRenewal()
    await expect(page).toHaveURL('/news')
  })

  test('retries after a failed renewal and returns to the requested page', async ({ page }) => {
    let attempts = 0
    await page.route(SESSION_ROUTE, async route => {
      attempts += 1
      if (attempts === 1) {
        await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR' } })
        return
      }
      await route.fulfill({ status: 200, json: { session: { uid: 'renewed' } } })
    })

    await navigateTo(page, RENEWAL_URL)

    await expect(page.getByTestId('session-renewal-failed')).toBeVisible()
    await page.getByTestId('session-renewal-retry').click()
    await expect(page).toHaveURL('/news')
  })

  test('keeps browser-proof recovery explicit and offers sign in', async ({ page }) => {
    await page.route(SESSION_ROUTE, async route => {
      await route.fulfill({ status: 403, json: { code: 'DBSC_PROOF_REQUIRED' } })
    })

    await navigateTo(page, RENEWAL_URL)

    await expect(page.getByTestId('session-renewal-proof-required')).toBeVisible()
    await expect(page.getByTestId('session-renewal-proof-continue')).toBeVisible()
    await page.getByTestId('session-renewal-proof-sign-in').click()
    await expect(page).toHaveURL('/login?next=%2Fnews')
  })

  test('continues to the requested page from browser-proof recovery', async ({ page }) => {
    await page.route(SESSION_ROUTE, async route => {
      await route.fulfill({ status: 403, json: { code: 'DBSC_PROOF_REQUIRED' } })
    })

    await navigateTo(page, RENEWAL_URL)

    await page.getByTestId('session-renewal-proof-continue').click()
    await expect(page).toHaveURL('/news')
  })
})
