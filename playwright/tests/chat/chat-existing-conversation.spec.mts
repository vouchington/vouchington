import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { SEEDED_CONVERSATION_ID } from '../../../backend/scripts/seeds/playwright-test-data/conversations.mts'

const SEEDED_CONVERSATION_URL = `/chat/${SEEDED_CONVERSATION_ID}`

test.describe('Chat — existing conversation /chat/:id', () => {
  test.use({ storageState: AUTH_STATE })

  test('loads seeded conversation with messages', async ({ page }) => {
    await navigateTo(page, SEEDED_CONVERSATION_URL)

    // All seeded messages should be visible (multiple user + assistant messages)
    const userMessages = page.getByTestId('chat-message-user')
    const assistantMessages = page.getByTestId('chat-message-assistant')
    await expect(userMessages.first()).toBeVisible()
    await expect(assistantMessages.first()).toBeVisible()
    await expect(assistantMessages.first().getByTestId('chat-message-content')).toBeVisible()
    expect(await userMessages.count()).toBeGreaterThanOrEqual(2)
    expect(await assistantMessages.count()).toBeGreaterThanOrEqual(2)
  })

  test('renders user messages on the right and assistant messages on the left', async ({
    page,
  }) => {
    await navigateTo(page, SEEDED_CONVERSATION_URL)

    const userBubble = page.getByTestId('chat-message-user').first()
    await expect(userBubble).toBeVisible()
    await expect(userBubble).toHaveClass(/justify-end/)

    const assistantBubble = page.getByTestId('chat-message-assistant').first()
    await expect(assistantBubble).toHaveClass(/justify-start/)
  })

  test('message list is scrollable when content overflows', async ({ page }) => {
    // Short viewport forces the seeded messages to overflow deterministically
    await page.setViewportSize({ width: 1280, height: 400 })
    await navigateTo(page, SEEDED_CONVERSATION_URL)

    await expect(page.getByTestId('chat-message-user').first()).toBeVisible()

    const messagesContainer = page.getByTestId('chat-messages')
    await expect(messagesContainer).toBeVisible()

    // Confirm content actually overflows before testing scroll
    const overflows = await messagesContainer.evaluate(el => el.scrollHeight > el.clientHeight)
    expect(overflows).toBe(true)

    // Scroll the messages container and verify scrollTop increases
    const scrolled = await messagesContainer.evaluate(el => {
      el.scrollTop = 0
      const before = el.scrollTop
      el.scrollTop = 200
      return el.scrollTop > before
    })
    expect(scrolled).toBe(true)
  })

  test('input is enabled and ready to accept new messages', async ({ page }) => {
    await navigateTo(page, SEEDED_CONVERSATION_URL)

    await expect(page.getByTestId('chat-input')).toBeVisible()

    const input = page.getByTestId('chat-input-textarea')
    await expect(input).toBeVisible()
    await expect(input).toBeEnabled()
    await expect(page.getByTestId('chat-streamed-content')).toHaveCount(0)
  })

  test('sending a message does not reload the page (page reload guard)', async ({ page }) => {
    // Mock SSE so no real OpenAI call is made
    await page.route('**/api/v1/conversations/*/chat', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/chat/)?.[1] ?? 'unknown'
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: [
          'event: metadata',
          `data: ${JSON.stringify({
            conversation_id: conversationId,
            job_id: '00000000-0000-7000-8000-000000000000',
            user_message_id: '00000000-0000-7000-8000-000000000001',
            assistant_message_id: '00000000-0000-7000-8000-000000000002',
          })}`,
          '',
          'event: text',
          'data: {"content":"Partial streamed response."}',
          '',
          'event: error',
          'data: {"error":"Mock stream failure"}',
          '',
        ].join('\n'),
      })
    })

    await navigateTo(page, SEEDED_CONVERSATION_URL)

    await expect(page.getByTestId('chat-message-user').first()).toBeVisible()

    // Plant the no-reload marker before submitting
    await page.evaluate(() => {
      ;(window as Window & { __noRefreshMarker?: boolean }).__noRefreshMarker = true
    })

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await input.pressSequentially('Is the Chase Sapphire Reserve worth it?')
    const chatRequest = page.waitForRequest('**/api/v1/conversations/*/chat')
    await page.getByTestId('chat-input-send-button').click()

    expect((await chatRequest).method()).toBe('POST')

    // URL must still be the conversation page (no navigation away)
    expect(page.url()).toContain(SEEDED_CONVERSATION_ID)
    const newestAssistantBubble = page.getByTestId('chat-message-assistant').last()
    await expect(newestAssistantBubble.getByTestId('chat-message-content')).toContainText(
      'Partial streamed response.',
    )
    await expect(newestAssistantBubble.getByTestId('chat-message-error')).toContainText(
      'Mock stream failure',
    )
    expect(
      await page.evaluate(
        () => (window as Window & { __noRefreshMarker?: boolean }).__noRefreshMarker === true,
      ),
    ).toBe(true)
  })

  test('Cmd+Enter submits a message without page reload', async ({ page }) => {
    await page.route('**/api/v1/conversations/*/chat', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/chat/)?.[1] ?? 'unknown'
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: [
          'event: metadata',
          `data: ${JSON.stringify({
            conversation_id: conversationId,
            job_id: '00000000-0000-7000-8000-000000000000',
            user_message_id: '00000000-0000-7000-8000-000000000003',
            assistant_message_id: '00000000-0000-7000-8000-000000000004',
          })}`,
          '',
          'event: text',
          'data: {"content":"Keyboard shortcut response."}',
          '',
          'event: done',
          'data: {}',
          '',
        ].join('\n'),
      })
    })

    await navigateTo(page, SEEDED_CONVERSATION_URL)

    await expect(page.getByTestId('chat-message-user').first()).toBeVisible()

    await page.evaluate(() => {
      ;(window as Window & { __noRefreshMarker?: boolean }).__noRefreshMarker = true
    })

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await input.pressSequentially('Tell me about points transfers')
    const chatRequest = page.waitForRequest('**/api/v1/conversations/*/chat')
    await input.press('ControlOrMeta+Enter')
    expect((await chatRequest).method()).toBe('POST')
    await expect(
      page.getByTestId('chat-message-content').filter({ hasText: 'Keyboard shortcut response.' }),
    ).toBeVisible()

    const markerSurvived = await page.evaluate(
      () => (window as Window & { __noRefreshMarker?: boolean }).__noRefreshMarker === true,
    )
    expect(markerSurvived).toBe(true)
  })
})
