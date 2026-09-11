import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// The test user seeded in playwright-test-data.mts (username: 'tests')
const TEST_USER_USERNAME = 'tests'

test.describe('Referral Attribution', () => {
  test('sets session cookies for anonymous visitor arriving via referral link', async ({
    page,
    context,
  }) => {
    // Clear all cookies to start as a fresh anonymous user
    await context.clearCookies()

    // Visit home page with a referrer param — no cookies yet
    await navigateTo(page, `/?referrer=${TEST_USER_USERNAME}`)

    // The middleware should have created a session and set cookies on the response
    const cookies = await context.cookies()
    const dt = cookies.find(c => c.name === 'dt')
    const st = cookies.find(c => c.name === 'st')

    expect(dt).toBeDefined()
    expect(dt?.value).toBeTruthy()
    expect(st).toBeDefined()
    expect(st?.value).toBeTruthy()
  })

  test('page loads without error for unknown referrer', async ({ page, context }) => {
    await context.clearCookies()

    // An unknown referrer should not cause a page error
    const response = await page.goto('/?referrer=this-user-does-not-exist-xyz')
    expect(response?.status()).toBeLessThan(500)

    // Session cookies should still be set (session is created regardless of referrer validity)
    const cookies = await context.cookies()
    const st = cookies.find(c => c.name === 'st')
    expect(st).toBeDefined()
  })

  test('page loads without error for UUID referrer', async ({ page, context }) => {
    await context.clearCookies()

    // Test user ID seeded in playwright-test-data.mts (username: 'tests')
    const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'
    const response = await page.goto(`/?referrer=${TEST_USER_ID}`)
    expect(response?.status()).toBeLessThan(500)

    const cookies = await context.cookies()
    const st = cookies.find(c => c.name === 'st')
    expect(st).toBeDefined()
  })

  test('existing session cookies are preserved when visiting referral link', async ({
    page,
    context,
  }) => {
    await context.clearCookies()

    // First visit with referrer to establish a session (sessions are only created with cookies or referrer param)
    await navigateTo(page, `/?referrer=${TEST_USER_USERNAME}`)
    const cookiesAfterFirstVisit = await context.cookies()
    const stBefore = cookiesAfterFirstVisit.find(c => c.name === 'st')
    expect(stBefore).toBeDefined()

    // Visit again with referrer — existing session should be reused
    await navigateTo(page, `/?referrer=${TEST_USER_USERNAME}`)
    const cookiesAfterReferral = await context.cookies()
    const stAfter = cookiesAfterReferral.find(c => c.name === 'st')
    expect(stAfter).toBeDefined()
    // Session token should remain the same (session reuse, not regeneration)
    expect(stAfter?.value).toBe(stBefore?.value)
  })
})

test.describe('Referral Attribution - Signed-in User', () => {
  test('page loads without error for signed-in user visiting referral link', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await loginAsTestUser(page)

    const response = await page.goto(`/?referrer=${TEST_USER_USERNAME}`)
    expect(response?.status()).toBeLessThan(500)
  })

  test('signed-in user session is preserved after visiting referral link', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await loginAsTestUser(page)

    const cookiesAfterLogin = await context.cookies()
    const stBefore = cookiesAfterLogin.find(c => c.name === 'st')
    expect(stBefore).toBeDefined()

    await navigateTo(page, `/?referrer=${TEST_USER_USERNAME}`)

    const cookiesAfterReferral = await context.cookies()
    const stAfter = cookiesAfterReferral.find(c => c.name === 'st')
    expect(stAfter).toBeDefined()
    // Authenticated session should be preserved, not replaced
    expect(stAfter?.value).toBe(stBefore?.value)
  })

  test('signed-in user remains authenticated after visiting referral link', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await loginAsTestUser(page)

    await navigateTo(page, `/?referrer=${TEST_USER_USERNAME}`)

    // Verify still logged in by checking for authenticated UI element
    const cookies = await context.cookies()
    const st = cookies.find(c => c.name === 'st')
    expect(st).toBeDefined()
    expect(st?.value).toBeTruthy()

    // Navigating to a protected page should not redirect to login
    await navigateTo(page, '/settings')
    expect(page.url()).not.toContain('/login')
  })
})
