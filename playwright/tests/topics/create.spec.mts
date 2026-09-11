import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'

test.describe('Topics Create', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/topics/create')
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to access create page', async ({ page }) => {
    await navigateTo(page, '/topics/create')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Create Topic')
    // The old "Create a new topic" subheading was removed; verify the heading is not that
    // string. We assert on the real h1 (not <body>) so the test fails if the heading is
    // missing rather than passing silently on a vacuous selector.
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Create a new topic')
    await expect(page.getByTestId('create-topic-name-input')).toBeVisible()
    await expect(page.getByTestId('create-topic-hostname-input')).toBeVisible()
    await expect(page.getByTestId('create-topic-markdown-input')).toBeVisible()
  })

  test('shows similarity panels aside after typing a topic name', async ({ page }) => {
    await navigateTo(page, '/topics/create')

    let releaseSimilarityResponses!: () => void
    const similarityResponsesReleased = new Promise<void>(resolve => {
      releaseSimilarityResponses = resolve
    })
    // Hold similarity API responses so the transient loading skeleton remains observable.
    await page.route(/\/api\/v1\/(topics|posts|rss-feed-items)\?/, async route => {
      if (route.request().url().includes('semantic_search_query=')) {
        await similarityResponsesReleased
      }
      await route.continue()
    })

    // Before typing: hint shown, no panels
    await expect(page.getByTestId('similarity-panels-hint')).toBeVisible()

    // Type a topic name long enough to trigger the debounce (minLength=3)
    await page.getByTestId('create-topic-name-input').pressSequentially('Developer Tools')

    try {
      const skeletons = page.getByTestId('similarity-panel-loading-skeleton')
      await expect(skeletons).toHaveCount(3)
      await expect(skeletons.first()).toBeVisible({ timeout: 5000 })
    } finally {
      releaseSimilarityResponses()
    }

    // Panels container appears after debounce fires (400ms) and API responds
    await expect(page.getByTestId('similarity-panels')).toBeVisible({ timeout: 5000 })
    // All three panel headings should be present
    await expect(page.getByText('Similar topics')).toBeVisible()
    await expect(page.getByText('Similar news')).toBeVisible()
    await expect(page.getByText('Similar posts')).toBeVisible()
  })

  test('should create a topic and redirect to edit page', async ({ page }) => {
    await navigateTo(page, '/topics/create')

    const suffix = randomSuffix()
    await page.getByTestId('create-topic-name-input').fill(`Playwright Test Topic ${suffix}`)
    await page
      .getByTestId('create-topic-markdown-input')
      .pressSequentially('This is a test topic created by Playwright')
    // Wait for React to hydrate — the button is disabled (useSyncExternalStore mounted=false)
    // until the client has mounted, so being enabled is a reliable hydration signal.
    await expect(page.getByTestId('create-topic-submit')).toBeEnabled()
    // Slug is a controlled React input (value={slug}); pressSequentially must fire after
    // hydration so onChange updates the React state that handleSubmit reads directly.
    await page
      .getByTestId('create-topic-slug-input')
      .pressSequentially(`playwright-test-topic-${suffix}`)

    await page.getByTestId('create-topic-submit').click()

    // Should redirect to settings page (URL pattern: /:topic-type/:slug-or-id/settings)
    await page.waitForURL(/\/[a-z-]+\/[^/]+\/settings/)

    await expect(page.getByTestId('basic-info-heading')).toBeVisible()
  })

  test('slug availability check shows available for a new slug', async ({ page }) => {
    await navigateTo(page, '/topics/create')

    // Wait for hydration
    await expect(page.getByTestId('create-topic-submit')).toBeEnabled()

    const uniqueSlug = `new-unique-slug-${randomSuffix()}`
    await page.getByTestId('create-topic-slug-input').pressSequentially(uniqueSlug)
    // Blur by clicking outside the field
    await page.getByTestId('create-topic-name-input').click()

    // Error state is not shown initially or on available slug
    await expect(page.getByTestId('availability-indicator-error')).toBeHidden()
    await expect(page.getByTestId('availability-indicator-available')).toBeVisible()
  })

  test('slug availability check shows taken for an existing slug', async ({ page }) => {
    const suffix = randomSuffix()
    const existingSlug = `existing-topic-${suffix}`
    await insertTestTopic(`Existing Topic ${suffix}`, existingSlug)

    await navigateTo(page, '/topics/create')

    // Wait for hydration
    await expect(page.getByTestId('create-topic-submit')).toBeEnabled()

    await page.getByTestId('create-topic-slug-input').pressSequentially(existingSlug)
    // Blur by clicking outside the field
    await page.getByTestId('create-topic-name-input').click()

    await expect(page.getByTestId('availability-indicator-taken')).toBeVisible()
  })
})
