import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Chat — SSE streaming', () => {
  test('initial stream: text chunks and done event appear in UI', async ({ page }) => {
    await page.route('**/api/v1/conversations/*/chat', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/chat/)?.[1] ?? 'unknown'
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: [
          'event: metadata',
          `data: ${JSON.stringify({
            conversation_id: conversationId,
            user_message_id: '00000000-0000-7000-8000-000000000001',
            assistant_message_id: '00000000-0000-7000-8000-000000000002',
            job_id: 'mock-job-id',
          })}`,
          '',
          'event: text',
          'data: {"content":"Hello from the pub/sub transport!"}',
          '',
          'event: done',
          'data: {}',
          '',
        ].join('\n'),
      })
    })

    await loginAsTestUser(page)
    await navigateTo(page, '/chat')

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await input.pressSequentially('Hello streaming test')
    await page.getByTestId('chat-input-send-button').click()

    // Wait for the streamed content to appear
    await expect(page.getByText('Hello from the pub/sub transport!')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('follow-up stream: second message appears without clobbering first', async ({ page }) => {
    let callCount = 0

    await page.route('**/api/v1/conversations/*/chat', async route => {
      const url = route.request().url()
      const conversationId = url.match(/\/conversations\/([^/]+)\/chat/)?.[1] ?? 'unknown'
      callCount++
      const messageIndex = callCount

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: [
          'event: metadata',
          `data: ${JSON.stringify({
            conversation_id: conversationId,
            user_message_id: `00000000-0000-7000-8000-00000000000${messageIndex}`,
            assistant_message_id: `00000000-0000-7000-8000-10000000000${messageIndex}`,
            job_id: `mock-job-${messageIndex}`,
          })}`,
          '',
          'event: text',
          `data: {"content":"Reply number ${messageIndex}"}`,
          '',
          'event: done',
          'data: {}',
          '',
        ].join('\n'),
      })
    })

    await loginAsTestUser(page)
    await navigateTo(page, '/chat')

    const input = page.getByTestId('chat-input-textarea')
    await input.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    // Send first message
    await input.pressSequentially('First message')
    await page.getByTestId('chat-input-send-button').click()

    // Wait for navigation to /chat/:id after first message
    await page.waitForURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 })

    // Wait for first reply
    await expect(page.getByText('Reply number 1')).toBeVisible({ timeout: 10_000 })

    // Send second message in same conversation
    const inputAgain = page.getByTestId('chat-input-textarea')
    await inputAgain.scrollIntoViewIfNeeded()
    await inputAgain.pressSequentially('Second message')
    await page.getByTestId('chat-input-send-button').click()

    // Both replies should be visible
    await expect(page.getByText('Reply number 2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Reply number 1')).toBeVisible()
  })
})
