import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Chat — /chat landing page', () => {
  test.describe('unauthenticated', () => {
    // Clear auth cookies (not storageState) so cookie-consent localStorage stays set.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('redirects unauthenticated users to /login', async ({ page }) => {
      await navigateTo(page, '/chat')
      // Either a redirect response or the final URL ends at /login
      expect(page.url()).toContain('/login')
    })
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test('loads /chat page for authenticated user', async ({ page }) => {
      await navigateTo(page, '/chat')

      // The empty state or input should be visible
      await expect(page.getByTestId('chat-input-textarea')).toBeVisible()
    })

    test('displays empty state message when no conversation is active', async ({ page }) => {
      await navigateTo(page, '/chat')

      await expect(page.getByTestId('chat-empty-state-title')).toBeVisible()
    })

    test('send button is visible', async ({ page }) => {
      await navigateTo(page, '/chat')

      await expect(page.getByTestId('chat-input-send-button')).toBeVisible()
    })
  })
})

test.describe('Chat — create conversation', () => {
  test.use({ storageState: AUTH_STATE })

  test('creates a conversation and navigates to /chat/:id', async ({ page }) => {
    // Mock the chat streaming endpoint to avoid real OpenAI calls
    await page.route('**/api/v1/conversations/*/chat', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/chat/)?.[1] ?? 'unknown'
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: [
          'event: metadata',
          `data: ${JSON.stringify({ conversation_id: conversationId, user_message_id: '00000000-0000-7000-8000-000000000001', assistant_message_id: '00000000-0000-7000-8000-000000000002' })}`,
          '',
          'event: text',
          'data: {"content":"Mock response."}',
          '',
          'event: done',
          'data: {}',
          '',
        ].join('\n'),
      })
    })

    await navigateTo(page, '/chat')

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await input.pressSequentially('Hello, how do I apply for the Chase Sapphire Preferred?')
    await page.getByTestId('chat-input-send-button').click()

    // Wait for navigation to /chat/:id
    await page.waitForURL(/\/chat\/[a-f0-9-]+/)

    // The chat/chat endpoint is mocked above, so this does not prove backend
    // persistence. It proves the client-side relay actually works end to end:
    // the typed text survives URL-encoding into ?message=, PendingMessageEmitter
    // decodes and dispatches it, ConversationPageClient.handleSend turns it into
    // the optimistic user message, and ChatMessages renders it under the user
    // bubble — not just that the URL changed. A regression in any link of that
    // chain (wrong role on the optimistic message, a dropped/garbled event, the
    // assistant-only empty-content skip misapplied to user messages) fails this.
    await expect(
      page.getByTestId('chat-message-user').getByTestId('chat-message-content'),
    ).toContainText('Chase Sapphire Preferred')
  })

  test('Shift+Enter inserts newline without sending', async ({ page }) => {
    await navigateTo(page, '/chat')

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await input.pressSequentially('Line one')
    await input.press('Shift+Enter')
    await input.pressSequentially('Line two')

    // URL should not change — no conversation was created
    expect(page.url()).toContain('/chat')
    expect(page.url()).not.toMatch(/\/chat\/[a-f0-9-]+/)
  })
})

test.describe('Chat — conversation page /chat/:id', () => {
  // Helper: create a conversation and return its ID
  async function createConversation(page: Page): Promise<string> {
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: 'Playwright test conversation' }),
      })
      const data = (await res.json()) as { conversation: { id: string } }
      return data.conversation.id
    })
    return result
  }

  test.describe('unauthenticated', () => {
    // Clear auth cookies (not storageState) so cookie-consent localStorage stays set.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('redirects to /login when not authenticated', async ({ page }) => {
      // Create a fake but syntactically valid UUID
      await navigateTo(page, '/chat/01960000-0000-7000-8000-000000000001')
      expect(page.url()).toContain('/login')
    })
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test('loads conversation page with messages list', async ({ page }) => {
      await navigateTo(page, '/chat')

      const convId = await createConversation(page)

      // Navigate without ?message= to avoid triggering streaming in tests
      await navigateTo(page, `/chat/${convId}`)

      // Input should be visible and enabled
      await expect(page.getByTestId('chat-input-textarea')).toBeVisible()
    })

    test('shows empty state when conversation has no messages', async ({ page }) => {
      await navigateTo(page, '/chat')

      const convId = await createConversation(page)
      await navigateTo(page, `/chat/${convId}`)

      await expect(page.getByTestId('chat-empty-state-title')).toBeVisible()
    })

    test('stop button appears while streaming', async ({ page }) => {
      // Mock the chat streaming endpoint — hold the response open until after the
      // assertion so the stop button is visible, then fulfill cleanly (no hanging requests)
      let resolveRoute!: () => void
      const routeHeld = new Promise<void>(resolve => {
        resolveRoute = resolve
      })

      await page.route('**/api/v1/conversations/*/chat', async route => {
        // Wait for the assertion to complete before responding
        await routeHeld
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: 'event: done\ndata: {}\n\n',
        })
      })

      await navigateTo(page, '/chat')

      const convId = await createConversation(page)
      await navigateTo(page, `/chat/${convId}`)

      const input = page.getByTestId('chat-input-textarea')
      await input.scrollIntoViewIfNeeded()
      await waitForBelowFoldHydration(page)
      await input.pressSequentially('Quick test message')

      // Click send — streaming starts (route held open, isStreaming=true)
      await page.getByTestId('chat-input-send-button').click()

      // Stop button should appear while the route is held open
      await expect(page.getByTestId('chat-input-abort-button')).toBeVisible({
        timeout: 10_000,
      })

      // Fulfill the route cleanly now that the assertion passed
      resolveRoute()
    })
  })
})
