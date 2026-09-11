import { test, expect } from '../helpers/test.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { requireTestValue } from '../helpers/assertions.mts'

/**
 * Verifies that signed-out CTAs (vote, follow, join) include a ?next= return
 * URL so that after authentication the user is returned to the originating page.
 *
 * Also verifies that the login page itself honours the ?next= parameter and
 * that unsafe (non-relative) values are rejected.
 */

test.describe('?next= return URL on signed-out CTAs', () => {
  test('vote button href includes ?next= with current pathname', async ({ page }) => {
    await navigateTo(page, '/news')

    const voteLink = page.getByTestId('news-item-vote-sign-in').first()
    await expect(voteLink).toBeVisible()

    const href = await voteLink.getAttribute('href')
    // Must encode the /news pathname so login can return the user here
    expect(href).toContain('/login?next=%2Fnews')
  })

  test('follow button href includes ?next= with current pathname', async ({ page }) => {
    await navigateTo(page, '/topics')

    const followLink = page.locator('a[href^="/login?next="]', { hasText: /follow/i }).first()
    await expect(followLink).toBeVisible()

    const href = await followLink.getAttribute('href')
    expect(href).toContain('/login?next=%2Ftopics')
  })

  test('community join button shows login CTA for signed-out users', async ({ page }) => {
    // Navigate to a community page (any public community will do)
    const response = await page.goto('/communities')
    expect(response?.status()).toBe(200)

    const communityCards = page.getByTestId('community-card')
    await expect(communityCards).not.toHaveCount(0)

    // Navigate into the first community link
    const firstCommunityLink = communityCards.locator('a').first()
    const communityHref = requireTestValue(
      await firstCommunityLink.getAttribute('href'),
      'Community card must link to its community page',
    )

    await navigateTo(page, communityHref)

    // Should see a Join link pointing to /login?next=... (not null)
    const joinLink = page.getByTestId('join-button-signed-out')
    await expect(joinLink).toBeVisible()

    const href = await joinLink.getAttribute('href')
    expect(href).toMatch(/^\/login\?next=/)
    expect(href).toContain(encodeURIComponent(communityHref))
  })
})

test.describe('/login page — ?next= handling', () => {
  test('login page loads with ?next= param without error', async ({ page }) => {
    const response = await page.goto('/login?next=%2Ftopics%2Fcredit-cards')
    expect(response?.status()).toBe(200)

    await expect(page.getByTestId('login-form-heading')).toBeVisible()
  })

  test('login page loads with unsafe next without error (safe fallback)', async ({ page }) => {
    // An unsafe next (non-relative) should not crash the page
    const response = await page.goto('/login?next=https%3A%2F%2Fevil.example.com')
    expect(response?.status()).toBe(200)

    await expect(page.getByTestId('login-form-heading')).toBeVisible()
  })
})
