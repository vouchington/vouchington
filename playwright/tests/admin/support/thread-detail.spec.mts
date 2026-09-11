import { test, expect, type Page, withMonitoredPage } from '../../../helpers/test.mts'
import { loginAsAdmin } from '../../../helpers/auth.mts'
import { navigateTo } from '../../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../../helpers/auth-state.mts'
import { randomSuffix } from '../../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../../helpers/wait-for-hydration.mts'
import { insertTestSupportMessage } from '../../../../backend/test-helpers/entities/support-messages.mts'

const SEEDED_INBOUND_MESSAGE = 'Playwright inbound support message'

/**
 * Creates a support thread via the user-facing API and returns the thread ID.
 * Uses fetch inside the page context so the session cookie is forwarded.
 */
function createSupportThread(page: Page, subject: string): Promise<string> {
  return page.evaluate(async (s: string) => {
    const res = await fetch('/api/v1/my/support-threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ subject: s }),
    })
    if (!res.ok) throw new Error(`Failed to create support thread: ${res.status}`)
    const data = (await res.json()) as { thread: { id: string } }
    return data.thread.id
  }, subject)
}

test.describe('Admin Support — /support/threads/:threadId thread detail', () => {
  test.use({ storageState: AUTH_STATE })

  let threadId: string

  test.beforeAll(async ({ browser }, testInfo) => {
    await withMonitoredPage(browser, testInfo, async page => {
      // withMonitoredPage creates a fresh context (no AUTH_STATE) — inject auth explicitly.
      await loginAsAdmin(page)
      const random = randomSuffix()
      threadId = await createSupportThread(page, `Playwright test thread ${random}`)
      await insertTestSupportMessage({
        supportThreadId: threadId,
        direction: 'inbound',
        bodyText: SEEDED_INBOUND_MESSAGE,
      })
    })
  })

  test('loads thread detail page for admin', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    // Thread subject should be shown as a heading
    await expect(page.getByTestId('support-thread-page-heading')).toBeVisible()
  })

  test('shows thread status badge', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    // A status badge (open/assigned/resolved) should appear in the header area
    await expect(
      page
        .getByTestId('support-thread-status-open')
        .or(page.getByTestId('support-thread-status-assigned'))
        .or(page.getByTestId('support-thread-status-resolved'))
        .first(),
    ).toBeVisible()
  })

  test('shows Assign to Me button for open thread', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    await expect(page.getByTestId('support-thread-assign-to-me')).toBeVisible()
  })

  test('shows Resolve button for non-resolved thread', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    await expect(page.getByTestId('support-thread-resolve')).toBeVisible()
  })

  test('shows Generate AI Draft button', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    await expect(page.getByTestId('support-thread-generate-ai-draft')).toBeVisible()
  })

  test('shows Send Reply section with textarea and button', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    await expect(page.getByTestId('support-thread-send-reply-heading')).toBeVisible()
    await expect(page.getByTestId('support-thread-reply-textarea')).toBeVisible()
    await expect(page.getByTestId('support-thread-send-reply')).toBeVisible()
  })

  test('shows the seeded inbound message history', async ({ page }) => {
    await navigateTo(page, `/support/threads/${threadId}`)

    await expect(page.getByTestId('support-thread-empty-messages')).toBeHidden()
    await expect(
      page.getByTestId('support-message').filter({ hasText: SEEDED_INBOUND_MESSAGE }),
    ).toBeVisible()
  })

  test('resolves thread when Resolve button is clicked', async ({ page }) => {
    // Establish the worker origin before createSupportThread's relative fetch —
    // with storageState the page starts at about:blank (no origin).
    await navigateTo(page, '/')
    // Create a dedicated thread for mutation testing
    const random = randomSuffix()
    const mutateThreadId = await createSupportThread(page, `Playwright resolve test ${random}`)

    await navigateTo(page, `/support/threads/${mutateThreadId}`)

    const resolveBtn = page.getByTestId('support-thread-resolve')
    await expect(resolveBtn).toBeVisible()
    await resolveBtn.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await resolveBtn.click()
    await expect(page.getByTestId('support-action-confirmation-dialog')).toBeVisible()
    await page.getByTestId('support-action-confirmation-confirm').click()

    // After resolving, the Reopen button should appear and Resolve should be gone
    await expect(page.getByTestId('support-thread-reopen')).toBeVisible({ timeout: 10_000 })
  })

  test('persists a manual outbound reply without claiming email delivery', async ({ page }) => {
    await navigateTo(page, '/')
    const id = await createSupportThread(page, `Playwright manual reply ${randomSuffix()}`)
    await navigateTo(page, `/support/threads/${id}`)

    await expect(page.getByText('Saves this reply in the thread. It is not emailed.')).toBeVisible()
    await page.getByTestId('support-thread-reply-textarea').fill('Recorded by Playwright.')
    await page.getByTestId('support-thread-send-reply').click()

    await expect(
      page.getByTestId('support-message').filter({ hasText: 'Recorded by Playwright.' }),
    ).toBeVisible()
  })

  test('redirects unauthenticated user away from /support/threads/:threadId', async ({ page }) => {
    // Unauthenticated — admin layout redirects unauthorized users to homepage
    await page.context().clearCookies()
    const response = await page.goto(`/support/threads/${threadId}`)
    expect(page.url()).not.toContain(`/support/threads/${threadId}`)
    expect(response).toBeDefined()
  })
})
