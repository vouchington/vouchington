import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'

/**
 * Regression test: toggling a bookmark button on a user profile must not fire
 * GET /api/v1/bookmarks/user/:id requests from sibling buttons with different predicates.
 *
 * Previously the BookmarkChange event was not filtered by predicate, so toggling Subscribe
 * caused Follow, Mute, and Block buttons to each refetch the same endpoint (3 wasted GETs).
 * The fix filters the event handler by predicate so only buttons with the same predicate react.
 */
test.describe('User profile bookmark dedup', () => {
  test.use({ storageState: AUTH_STATE })

  test('toggling subscribe does not trigger GET refetches from sibling bookmark buttons', async ({
    page,
  }) => {
    await withCleanUser(page)
    await navigateTo(page, '/user/test-friend')

    // Wait for subscribe button to be interactive before counting requests
    const subscribeButton = page.getByTestId('user-profile-subscribe-posts-button')
    await expect(subscribeButton).toBeEnabled()

    await expect(subscribeButton).toContainText('Subscribe to Posts')

    // Start counting GETs only after the page is settled and we're about to click
    const getRequestUrls: string[] = []
    await page.route('**/api/v1/bookmarks/user/**', route => {
      if (route.request().method() === 'GET') {
        getRequestUrls.push(route.request().url())
      }
      return route.continue()
    })

    const putResponse = page.waitForResponse(
      r =>
        r.ok() &&
        r.url().includes('/api/v1/bookmarks/user/') &&
        r.url().endsWith('/subscribe') &&
        r.request().method() === 'PUT',
    )
    await subscribeButton.click()
    await putResponse

    // Wait for isPending to clear (button re-enabled after the finally block) — this confirms
    // emitBookmarkChange has already fired and any sibling event handlers have run.
    await expect(subscribeButton).toBeEnabled()

    // Follow, Mute, and Block buttons have different predicates — they must not refetch
    // after a Subscribe toggle. With predicate filtering, 0 sibling GETs fire.
    expect(
      getRequestUrls,
      `Expected 0 GET /api/v1/bookmarks/user/ calls after Subscribe toggle but got:\n${getRequestUrls.join('\n')}`,
    ).toHaveLength(0)

    // Restore: unsubscribe so the test is idempotent
    const deleteResponse = page.waitForResponse(
      r =>
        r.url().includes('/api/v1/bookmarks/user/') &&
        r.url().endsWith('/subscribe') &&
        r.request().method() === 'DELETE',
    )
    await subscribeButton.click()
    await deleteResponse
  })
})
