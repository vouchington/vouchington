import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { followRssFeed } from '../../../backend/test-helpers/index.mts'

// Seeded RSS feed that has items on /news and is followed by the seeded test user.
// Source: backend/scripts/seeds/playwright-test-data/feeds.mts
const SEEDED_RSS_FEED_ID = '019c64e6-f8c0-7000-8000-000000000001'

// The /news feed batch-loads save state via the bookmarks sidecar.
// This spec verifies the Save button is present for signed-in users,
// reflects pre-seeded state, and toggles correctly with persistence.
test.describe('Save button on /news cards', () => {
  test.use({ storageState: AUTH_STATE })

  test('save button is absent for signed-out users', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/news')
    await expect(page.getByTestId('save-button')).toHaveCount(0)
  })

  test('save button is present for signed-in users and reflects saved state', async ({ page }) => {
    await navigateTo(page, '/news')

    // At least one Save or Saved button must appear (reached via data-pw='save-button')
    const saveButton = page.getByTestId('save-button').first()
    await expect(saveButton).toBeVisible()
  })
})

// Toggle and persistence use a fresh isolated user (no saved items) so the test
// is deterministic regardless of the shared seeded user's accumulated save history.
test.describe('Save button on /news cards — toggle persistence', () => {
  test('save button toggles and persists after navigation', async ({ page }) => {
    // Follow the seeded RSS feed so /news shows items for the fresh user.
    const viewer = await withCleanUser(page)
    await followRssFeed(viewer, SEEDED_RSS_FEED_ID)
    await navigateTo(page, '/news')

    // Fresh user has no saved items — go straight to an unsaved card
    const unsavedBtn = page
      .getByTestId('save-button')
      .and(page.locator('[aria-pressed="false"]'))
      .first()
    await expect(unsavedBtn).toBeVisible()
    await expect(unsavedBtn).toHaveAttribute('aria-pressed', 'false')

    // Click to save
    const savePromise = page.waitForResponse(
      response =>
        /\/api\/v1\/bookmarks\/rss_feed_item\/[^/]+\/save/.test(response.url()) &&
        response.status() < 400,
    )
    await unsavedBtn.click()
    await savePromise

    // Optimistic: aria-pressed flips to true
    await expect(
      page.getByTestId('save-button').and(page.locator('[aria-pressed="true"]')).first(),
    ).toHaveAttribute('aria-pressed', 'true')

    // Persist: re-navigate and verify state is still saved
    await navigateTo(page, '/news')
    const savedAfterReload = page
      .getByTestId('save-button')
      .and(page.locator('[aria-pressed="true"]'))
      .first()
    await expect(savedAfterReload).toHaveAttribute('aria-pressed', 'true')

    // Click to unsave
    const unsavePromise = page.waitForResponse(
      response =>
        /\/api\/v1\/bookmarks\/rss_feed_item\/[^/]+\/save/.test(response.url()) &&
        response.status() < 400,
    )
    await savedAfterReload.click()
    await unsavePromise

    await expect(
      page.getByTestId('save-button').and(page.locator('[aria-pressed="false"]')).first(),
    ).toHaveAttribute('aria-pressed', 'false')
  })
})
