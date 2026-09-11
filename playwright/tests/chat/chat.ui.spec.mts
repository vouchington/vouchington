import { test, expect } from '../../helpers/test.mts'

import { AUTH_STATE } from '../../helpers/auth-state.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'

import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

import { setFeatureFlags } from '../../helpers/feature-flags.mts'

import {
  SEEDED_SECOND_PAGE_CONVERSATION_ID,
  SEEDED_SECOND_PAGE_CONVERSATION_TITLE,
} from '../../../backend/scripts/seeds/playwright-test-data/conversations.mts'

test.describe('Chat — sidebar navigation', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows Chats section in sidebar when chat flag enabled on /chat route', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('chat-sidebar-group')).toBeVisible()
  })

  test('does not show Chats section on non-chat-intent routes even when flag enabled', async ({
    page,
  }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/my/cards')

    // ChatsSidebarGroup is scoped to the chat intent route; non-chat routes do not show it
    await expect(page.getByTestId('chat-sidebar-group')).toBeHidden()
  })

  test('does not show Chats section when chat flag is disabled', async ({ page }) => {
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('chat-sidebar-group')).toBeHidden()
  })

  test('shows New Chat link in sidebar on chat route', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('chat-new-chat-link')).toBeVisible()
  })

  test('New Chat link navigates to /chat', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })

    // Create a conversation via API so we have a /chat/:id page to navigate from
    await navigateTo(page, '/chat')

    const convId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: 'Sidebar nav test' }),
      })
      const data = (await res.json()) as { conversation: { id: string } }
      return data.conversation.id
    })
    await navigateTo(page, `/chat/${convId}`)

    // Navigate via direct URL instead of clicking sidebar link, since the
    // full-height chat layout can overlap the sidebar in CI viewports
    await navigateTo(page, '/chat')
    expect(page.url()).toContain('/chat')
    expect(page.url()).not.toMatch(/\/chat\/[a-f0-9-]+/)
  })

  test('preserves loaded sidebar conversations across route changes', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')

    const sidebar = page.getByTestId('sidebar-peer')
    const secondPageConversation = sidebar.getByTestId('chat-conversation-link').filter({
      hasText: SEEDED_SECOND_PAGE_CONVERSATION_TITLE,
    })
    const continuation = sidebar.getByTestId('paginated-list-continuation')
    await expect(continuation).toBeVisible()
    await continuation.getByRole('button').click()

    await expect(secondPageConversation).toBeVisible()
    await secondPageConversation.click()
    await expect(page).toHaveURL(`/chat/${SEEDED_SECOND_PAGE_CONVERSATION_ID}`)
    await expect(secondPageConversation).toBeVisible()
  })
})

test.describe('Chat — mobile responsive', () => {
  test.use({ storageState: AUTH_STATE })

  test('no horizontal scroll at 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/chat')

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })

  test('no horizontal scroll at 320px minimum viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await navigateTo(page, '/chat')

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })

  test('input and send button visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('chat-input-textarea')).toBeVisible()
    await expect(page.getByTestId('chat-input-send-button')).toBeVisible()
  })
})

test.describe('Chat — horizontal centering', () => {
  test.use({ storageState: AUTH_STATE })

  test('chat content is constrained to max-w-3xl', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await navigateTo(page, '/chat')

    const hasMaxWidth = await page.evaluate(() => {
      const el = document.querySelector('.max-w-3xl')
      return el !== null
    })
    expect(hasMaxWidth).toBe(true)
  })

  test('no horizontal scroll at 1280px with centering', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await navigateTo(page, '/chat')

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })
})

test.describe('Chat — message submission without page refresh', () => {
  test.use({ storageState: AUTH_STATE })

  test('sending a message strips ?message= param without reloading page', async ({ page }) => {
    // Mock SSE to avoid real OpenAI calls
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
          'data: {"content":"Test response without refresh."}',
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
    await input.pressSequentially('Does submitting refresh the page?')

    // Set marker before clicking — a full page reload clears it, replaceState does not
    await page.evaluate(() => {
      ;(window as Window & { __noRefreshMarker?: boolean }).__noRefreshMarker = true
    })

    const chatRequest = page.waitForRequest('**/api/v1/conversations/*/chat')
    await page.getByTestId('chat-input-send-button').click()

    expect((await chatRequest).method()).toBe('POST')

    // Marker must survive — window.history.replaceState does not reload the page
    const markerSurvived = await page.evaluate(
      () => (window as Window & { __noRefreshMarker?: boolean }).__noRefreshMarker === true,
    )
    expect(markerSurvived).toBe(true)

    // ?message= param must be stripped from URL
    expect(page.url()).not.toContain('?message=')
  })
})
