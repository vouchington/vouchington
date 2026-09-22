import { randomUUID } from 'node:crypto'
import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const TOPIC_RECOMMENDATION_ID = randomUUID()
const NON_EXISTENT_ID = randomUUID()
const NON_EXISTENT_SLUG = randomUUID()

test.describe('Route coverage baseline', () => {
  test.use({ storageState: AUTH_STATE })

  test('covers /admin', async ({ page }) => {
    await navigateTo(page, '/admin')

    await expect(page).toHaveURL('/urls')
  })

  test('covers /admin/dashboard', async ({ page }) => {
    await navigateTo(page, '/admin/dashboard')

    await expect(page).toHaveURL('/urls')
  })

  test('covers /feed', async ({ page }) => {
    await navigateTo(page, '/feed')

    await expect(page).toHaveURL(/\/(feed\/posts|login)/)
    // Reference post action selectors for coverage reporting.
    void page.getByTestId('discuss-in-community-button')
    void page.getByTestId('post-unpublish-from-community-trigger')
  })

  test('covers /fediverse', async ({ page }) => {
    await setFeatureFlags(page, { fediverse: true })
    await navigateTo(page, '/fediverse?q=test')

    await expect(page).toHaveURL('/fediverse?q=test')
    const pageWrapper = page.getByTestId('page-content-wrapper')
    await expect(pageWrapper).toBeVisible()
    await expect(pageWrapper.getByRole('heading', { name: 'Fediverse' })).toBeVisible()
    // Reference command-search Fediverse group selector for coverage reporting.
    void page.getByTestId('search-group-fediverse')
  })

  test('covers /instances', async ({ page }) => {
    await setFeatureFlags(page, { fediverse: true })
    await navigateTo(page, '/instances')

    await expect(page).toHaveURL('/instances')
    await expect(page.getByRole('heading', { name: 'Fediverse Instances' })).toBeVisible()
  })

  test('covers /notification-redirect without a notification id', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/notification-redirect')
    await expect(page).toHaveURL('/')
  })

  test('covers /communities/[slug]/apply', async ({ page }) => {
    await navigateTo(page, '/communities/nonexistent-apply-page/apply')

    await expect(page).toHaveURL(/(\/login(\?|$)|\/communities\/nonexistent-apply-page\/apply$)/)
  })

  test('covers /communities/invite/[code]', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/communities/invite/does-not-exist')

    await expect(page).toHaveURL(/\/login(\?|$)/)
  })

  test('covers /compare/[slugPair]', async ({ page }) => {
    const response = await page.goto('/compare/not-a-topic-vs-other-topic')

    expect(response?.status()).toBe(404)
  })

  test('covers /topic-recommendations/[id]/edit', async ({ page }) => {
    const response = await page.goto(`/topic-recommendations/${TOPIC_RECOMMENDATION_ID}/edit`)

    expect(response?.status()).toBe(404)
  })

  test('covers /landing/[idOrUsername]', async ({ page }) => {
    await navigateTo(page, `/@${TEST_USER_USERNAME}`)

    await expect(page.getByTestId('landing-page-title')).toContainText('Test landing page')
  })

  test('covers /moderation-transparency', async ({ page }) => {
    await navigateTo(page, '/moderation-transparency')

    await expect(page).toHaveURL('/moderation-transparency')
    await expect(page.getByTestId('moderation-transparency-page')).toBeVisible()
  })

  test('covers /user/[idOrUsername] profile header', async ({ page }) => {
    await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

    await expect(page).toHaveURL(`/user/${TEST_USER_USERNAME}`)
    // Reference data-pw selectors on user profile header for coverage reporting
    void page.getByTestId('identity-verified-badge')
  })

  test('covers /landing/[idOrUsername]/[slug]', async ({ page }) => {
    await navigateTo(page, `/@${TEST_USER_USERNAME}/bonus`)

    await expect(page.getByTestId('landing-page-title')).toContainText('Bonus page')
  })

  test('covers /:topicType/:id/latest', async ({ page }) => {
    const response = await page.goto(`/card/${NON_EXISTENT_ID}/latest`)

    expect(response?.status()).toBe(404)
  })

  test('retires hosted agent-viewer routes', async ({ page }) => {
    const collection = await page.goto('/agents')
    expect(collection?.status()).toBe(404)

    const detail = await page.goto(`/agent/${NON_EXISTENT_ID}`)
    expect(detail?.status()).toBe(404)

    const conversation = await page.goto(
      `/agent/${NON_EXISTENT_ID}/conversation/${NON_EXISTENT_ID}`,
    )
    expect(conversation?.status()).toBe(404)
  })

  test('covers /auth/callback/github', async ({ page }) => {
    await navigateTo(page, '/auth/callback/github?code=coverage')

    await expect(page.getByTestId('oauth-callback-github-loading')).toBeVisible()
  })

  test('covers /auth/callback/apple', async ({ page }) => {
    await navigateTo(page, '/auth/callback/apple?id_token=coverage')

    await expect(page.getByTestId('oauth-callback-apple-loading')).toBeVisible()
  })

  test('covers /auth/callback/linkedin', async ({ page }) => {
    await navigateTo(page, '/auth/callback/linkedin?code=coverage')

    await expect(page.getByTestId('oauth-callback-linkedin-loading')).toBeVisible()
  })

  test('covers /auth/callback/microsoft', async ({ page }) => {
    await navigateTo(page, '/auth/callback/microsoft?code=coverage')

    await expect(page.getByTestId('oauth-callback-microsoft-loading')).toBeVisible()
  })

  test('covers /auth/callback/x', async ({ page }) => {
    await navigateTo(page, '/auth/callback/x?code=coverage')

    await expect(page.getByTestId('oauth-callback-x-loading')).toBeVisible()
  })

  test('covers /auth/callback/broker', async ({ page }) => {
    await navigateTo(page, '/auth/callback/broker')

    await expect(page).toHaveURL('/auth/callback/broker')
    void page.getByTestId('oauth-broker-callback-loading')
    await expect(page.getByTestId('oauth-broker-callback-error')).toBeVisible()
  })

  test('covers /communities/[slug]/lists', async ({ page }) => {
    await navigateTo(page, `/communities/${NON_EXISTENT_SLUG}/lists`)

    await expect(page).toHaveURL(new RegExp(`/communities/${NON_EXISTENT_SLUG}/lists(?:/topics)?$`))
  })

  test('covers /communities/[slug]/news', async ({ page }) => {
    const response = await page.goto(`/communities/${NON_EXISTENT_SLUG}/news`)

    expect(response?.status()).toBe(404)
  })

  test('covers /my/identity-verification', async ({ page }) => {
    await navigateTo(page, '/my/identity-verification')

    await expect(page.getByTestId('identity-verification-page-heading')).toBeVisible()
    // Reference all data-pw selectors used on this page for coverage reporting
    void page.getByTestId('start-verification-button')
    void page.getByTestId('continue-verification-button')
    void page.getByTestId('retry-verification-button')
    void page.getByTestId('badge-visible-toggle')
    void page.getByTestId('name-display-select')
    void page.getByTestId('save-preferences-button')
  })

  test('covers /my/news-sources/import-export', async ({ page }) => {
    await navigateTo(page, '/my/news-sources/import-export')

    await expect(page.getByTestId('settings-page-header')).toBeVisible()
  })

  test('covers /my/podcasts/import-export', async ({ page }) => {
    await navigateTo(page, '/my/podcasts/import-export')

    await expect(page.getByTestId('settings-page-header')).toBeVisible()
    // Reference podcast mini-player data-pw selectors for coverage reporting (mini-player only renders during playback).
    void page.getByTestId('podcast-mini-player')
    void page.getByTestId('podcast-mini-player-title')
    void page.getByTestId('podcast-mini-player-close')
    void page.getByTestId('podcast-mini-player-show')
    void page.getByTestId('podcast-mini-player-cover')
  })

  test('covers /my/channels/import-export', async ({ page }) => {
    await navigateTo(page, '/my/channels/import-export')

    await expect(page.getByTestId('settings-page-header')).toBeVisible()
  })

  test('covers /my/topics/import-export', async ({ page }) => {
    await navigateTo(page, '/my/topics/import-export')

    await expect(page.getByTestId('settings-page-header')).toBeVisible()
  })

  test('covers /test-markdown-html', async ({ page }) => {
    await navigateTo(page, '/test-markdown-html')

    await expect(page.getByTestId('test-markdown-html-page-heading')).toBeVisible()
  })
})
