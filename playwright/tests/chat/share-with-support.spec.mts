import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

async function createConversation(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch('/api/v1/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: 'Playwright support privacy conversation' }),
    })
    const data = (await res.json()) as { conversation: { id: string } }
    return data.conversation.id
  })
}

test.describe('Support — /chat/support new thread form', () => {
  test.describe('unauthenticated', () => {
    // Clear auth cookies (not storageState) so cookie-consent localStorage stays set.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('redirects unauthenticated users to /login', async ({ page }) => {
      const response = await page.goto('/chat/support/new')
      await page.waitForLoadState('load')
      expect(page.url()).toContain('/login')
      expect(response).toBeDefined()
    })
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test('loads new support thread form for authenticated user', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Submit a Support Request',
      )
      // Support pages have no companion content — aside panel must not render
      await expect(page.locator('aside')).toHaveCount(0)
    })

    test('shows Subject field', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      await expect(page.getByTestId('support-thread-subject-input')).toBeVisible()
    })

    test('shows optional Message field', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      await expect(page.getByTestId('support-thread-message-input')).toBeVisible()
    })

    test('shows Submit Request button (disabled without subject)', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      const submitBtn = page.getByTestId('support-thread-submit-button')
      await expect(submitBtn).toBeVisible()
      await expect(submitBtn).toBeDisabled()
    })

    test('enables Submit Request button when subject is filled', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      const subjectInput = page.getByTestId('support-thread-subject-input')
      await subjectInput.pressSequentially('Help with my account')

      await expect(page.getByTestId('support-thread-submit-button')).toBeEnabled()
    })

    test('shows Cancel link', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      await expect(page.getByTestId('support-thread-cancel-link')).toBeVisible()
    })

    test('shows conversation link notice when conversation_id param present', async ({ page }) => {
      // Use a fake valid UUID for the conversation_id param
      await navigateTo(
        page,
        '/chat/support/new?conversation_id=01960000-0000-7000-8000-000000000001',
      )

      await expect(page.getByTestId('support-thread-conversation-notice')).toBeVisible()
    })

    test('creates a support thread and navigates to thread page', async ({ page }) => {
      await navigateTo(page, '/chat/support/new')

      const random = randomSuffix()
      const subject = `Playwright test request ${random}`

      await page.getByTestId('support-thread-subject-input').pressSequentially(subject)
      await page
        .getByTestId('support-thread-message-input')
        .pressSequentially('This is a test message from Playwright.')

      await page.getByTestId('support-thread-submit-button').click()

      // Should navigate to /chat/support/:id after successful submission
      await page.waitForURL(/\/chat\/support\/[a-f0-9-]+/)
      expect(page.url()).toMatch(/\/chat\/support\/[a-f0-9-]+/)

      // Thread detail page must also suppress the aside panel
      await expect(page.locator('aside')).toHaveCount(0)
      await expect(page.getByTestId('page-header')).toBeVisible()
    })

    test('creates a support thread linked to an owned conversation', async ({ page }) => {
      const conversationId = await createConversation(page)
      await navigateTo(page, `/chat/support/new?conversation_id=${conversationId}`)

      const random = randomSuffix()
      await page
        .getByTestId('support-thread-subject-input')
        .pressSequentially(`Playwright linked support ${random}`)
      await expect(page.getByTestId('support-thread-conversation-notice')).toBeVisible()
      await page.getByTestId('support-thread-submit-button').click()

      await page.waitForURL(/\/chat\/support\/[a-f0-9-]+/)
      await expect(page.getByTestId('page-header')).toBeVisible()
    })
  })
})

test.describe('Support — /chat/support thread list (user view)', () => {
  test.describe('unauthenticated', () => {
    // Clear auth cookies (not storageState) so cookie-consent localStorage stays set.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('redirects unauthenticated users to /login', async ({ page }) => {
      const response = await page.goto('/chat/support')
      await page.waitForLoadState('load')
      expect(page.url()).toContain('/login')
      expect(response).toBeDefined()
    })
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test('loads support list page for authenticated user', async ({ page }) => {
      await navigateTo(page, '/chat/support')

      await expect(page.getByRole('heading', { level: 1 })).toContainText('Support')
      // PageHeader canonical component must be used
      await expect(page.getByTestId('page-header')).toBeVisible()
      await expect(page.getByTestId('page-header')).toContainText(
        'View and manage your support requests',
      )
      // Support pages have no companion content — aside panel must not render
      await expect(page.locator('aside')).toHaveCount(0)
    })

    test('shows New Request button', async ({ page }) => {
      await navigateTo(page, '/chat/support')

      await expect(page.getByTestId('support-new-request-link')).toBeVisible()
    })
  })
})
