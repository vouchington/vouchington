import { test, expect } from '../../helpers/test.mts'

import { AUTH_STATE } from '../../helpers/auth-state.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'

import { randomSuffix } from '../../helpers/random-id.mts'

import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

import { setFeatureFlags } from '../../helpers/feature-flags.mts'

test.describe('Chat — sidebar shows new conversation', () => {
  test.use({ storageState: AUTH_STATE })

  test('new conversation appears in sidebar after creation', async ({ page }) => {
    const uniqueTitle = `sidebar-test-${randomSuffix()}`

    // Mock SSE to return streamed text, triggering AI title generation after first exchange
    await page.route('**/api/v1/conversations/*/chat', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/chat/)?.[1] ?? 'unknown'
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: [
          'event: metadata',
          `data: ${JSON.stringify({ conversation_id: conversationId, user_message_id: '00000000-0000-7000-8000-000000000003', assistant_message_id: '00000000-0000-7000-8000-000000000004' })}`,
          '',
          'event: text',
          `data: ${JSON.stringify({ content: 'Hello! How can I help?' })}`,
          '',
          'event: done',
          'data: {}',
          '',
        ].join('\n'),
      })
    })

    // Mock AI title endpoint to return the user's message text as the generated title
    await page.route('**/api/v1/my/conversations/*/title', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/title/)?.[1] ?? 'unknown'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversation: {
            id: conversationId,
            title: uniqueTitle,
            created_at: new Date().toISOString(),
            created_by_id: '019f0000-0000-7000-8000-000000000000',
            updated_at: new Date().toISOString(),
            updated_by_id: null,
            deleted_at: null,
            deleted_by_id: null,
          },
        }),
      })
    })

    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await input.pressSequentially(uniqueTitle)
    await page.getByTestId('chat-input-send-button').click()

    // Wait for navigation to /chat/:id
    await page.waitForURL(/\/chat\/[a-f0-9-]+/)

    // Sidebar should show the new conversation with the AI-generated title after first exchange
    await expect(
      page.getByTestId('chat-conversation-link').filter({ hasText: uniqueTitle }),
    ).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Chat — sidebar delete conversation', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')
  })

  test('delete button removes conversation from sidebar and redirects to /chat', async ({
    page,
  }) => {
    // Create a conversation via API
    const convId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: `delete-test-${Date.now()}` }),
      })
      const data = (await res.json()) as { conversation: { id: string } }
      return data.conversation.id
    })

    await navigateTo(page, `/chat/${convId}`)

    // Scope to the specific conversation row to avoid clicking the wrong delete button
    const conversationRow = page.locator('[data-sidebar="menu-item"]').filter({
      has: page.locator(`[href="/chat/${convId}"]`),
    })
    await conversationRow.waitFor({ state: 'visible' })
    await conversationRow.hover()
    await conversationRow.getByTestId('chat-delete-button').click()

    // Confirm deletion in AlertDialog
    await page.getByTestId('chat-delete-confirm-button').click()

    // Should redirect to /chat after deleting the active conversation
    await expect(page).toHaveURL('/chat')

    // Conversation link should be gone from sidebar
    await expect(page.locator(`a[href="/chat/${convId}"]`)).toBeHidden()
  })

  test('cancel button keeps conversation in sidebar', async ({ page }) => {
    const convId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: `cancel-test-${Date.now()}` }),
      })
      const data = (await res.json()) as { conversation: { id: string } }
      return data.conversation.id
    })

    await navigateTo(page, `/chat/${convId}`)

    const conversationRow = page.locator('[data-sidebar="menu-item"]').filter({
      has: page.locator(`[href="/chat/${convId}"]`),
    })
    await conversationRow.waitFor({ state: 'visible' })
    await conversationRow.hover()
    await conversationRow.getByTestId('chat-delete-button').click()
    await page.getByTestId('chat-delete-cancel-button').click()

    const conversationLink = page
      .getByTestId('chat-conversation-link')
      .and(page.locator(`[href="/chat/${convId}"]`))
    await expect(conversationLink).toBeVisible()
  })
})

test.describe('Chat — global search shortcuts', () => {
  test.use({ storageState: AUTH_STATE })

  test('New Chat shortcut appears in command palette for authenticated users with chat flag', async ({
    page,
  }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/')

    // Open search dialog with keyboard shortcut
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByTestId('search-input')).toBeVisible()

    await page.getByTestId('search-input').pressSequentially('New Chat')

    await expect(page.getByTestId('search-page-shortcut-chat')).toBeVisible()
  })

  test('New Chat shortcut does not appear when chat flag is disabled', async ({ page }) => {
    await navigateTo(page, '/')

    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByTestId('search-input')).toBeVisible()

    await page.getByTestId('search-input').pressSequentially('New Chat')

    await expect(page.getByTestId('search-page-shortcut-chat')).toBeHidden()
  })
})

test.describe('Chat — layout and footer', () => {
  test.use({ storageState: AUTH_STATE })

  test('sidebar site footer is rendered on the chat page', async ({ page }) => {
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('sidebar-site-footer')).toBeAttached()
  })

  test('chat page has no vertical page-level scroll at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await navigateTo(page, '/chat')

    const hasVerticalScroll = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    )
    expect(hasVerticalScroll).toBe(false)
  })

  test('chat page has no vertical page-level scroll at 375x667 mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/chat')

    const hasVerticalScroll = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    )
    expect(hasVerticalScroll).toBe(false)
  })
})
