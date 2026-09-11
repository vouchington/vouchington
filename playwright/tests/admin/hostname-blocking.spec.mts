import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix as rand } from '../../helpers/random-id.mts'
import { insertTestUrlHostname } from '../../../backend/test-helpers/index.mts'

test.describe('Admin Hostname Blocking', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can block a hostname via PATCH API and it appears in blocked list', async ({
    page,
  }) => {
    const hostname = `pw-block-${rand()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false })

    await navigateTo(page, '/')

    // Block the hostname via API
    const blockResult = await page.evaluate(async (id: string) => {
      const response = await fetch(`/api/v1/hostnames/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ blocked: true }),
      })
      return { status: response.status, body: await response.json() }
    }, hostnameId)

    expect(blockResult.status).toBe(200)
    expect(blockResult.body.blocked_hostname_count).toBeGreaterThanOrEqual(1)

    // Verify it appears in the blocked hostnames list
    const blockedList = await page.evaluate(findBlockedHostnameInList, hostnameId)

    expect(blockedList.status).toBe(200)
    expect(blockedList.found).toBe(true)
  })

  test('blocked hostname returns 404 for non-admin GET', async ({ page }) => {
    const hostname = `pw-blocked-404-${rand()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, crawlable: false, blocked: true })

    // Navigate as non-logged-in user — no login
    await page.context().clearCookies()
    await navigateTo(page, '/')

    const result = await page.evaluate(async (id: string) => {
      const response = await fetch(`/api/v1/hostnames/${id}`, {
        credentials: 'include',
      })
      return { status: response.status }
    }, hostnameId)

    expect(result.status).toBe(404)
  })

  test('admin sees blocked hostname in /api/v1/hostnames/blocked list', async ({ page }) => {
    const hostname = `pw-blocked-list-${rand()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, blocked: true })

    await navigateTo(page, '/')

    const result = await page.evaluate(findBlockedHostnameInList, hostnameId)

    expect(result.status).toBe(200)
    expect(result.found).toBe(true)
  })

  test('unauthenticated user gets 401 when attempting to block a hostname', async ({ page }) => {
    const hostnameId = await insertTestUrlHostname({
      hostname: `pw-401-${rand()}.example.com`,
    })

    // No login — unauthenticated request
    await page.context().clearCookies()
    await navigateTo(page, '/')

    const result = await page.evaluate(async (id: string) => {
      const response = await fetch(`/api/v1/hostnames/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ blocked: true }),
      })
      return { status: response.status }
    }, hostnameId)

    expect(result.status).toBe(401)
  })
})

async function findBlockedHostnameInList(hostnameId: string) {
  let after: string | null = null
  for (let i = 0; i < 50; i++) {
    const query = new URLSearchParams({ limit: '100' })
    if (after) query.set('after', after)
    const response = await fetch(`/api/v1/hostnames/blocked?${query}`, {
      credentials: 'include',
    })
    if (response.status !== 200) return { status: response.status, found: false }
    const body = await response.json()
    const found = (body.results as Array<{ id: string }>).some(h => h.id === hostnameId)
    if (found) return { status: response.status, found }
    after = body.page_info?.end_cursor ?? null
    if (!after) return { status: 200, found: false }
  }
  return { status: 200, found: false }
}
