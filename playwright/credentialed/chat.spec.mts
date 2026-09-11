// Real OpenAI chat test — exercises the full chat pipeline including the ai_agents
// queue worker and OpenAI API. Requires OPENAI_API_KEY.
// This test is skipped when the credential is not available (dependabot / untrusted PRs).

import { test, expect } from '../../playwright/helpers/test.mts'
import { loginAsTestUser } from '../../playwright/helpers/auth.mts'
import { navigateTo } from '../../playwright/helpers/navigate-to.mts'
import { setFeatureFlags } from '../../playwright/helpers/feature-flags.mts'
import { waitForBelowFoldHydration } from '../../playwright/helpers/wait-for-hydration.mts'

const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY)

// Skip the entire suite at the file level so no hooks run when the key is absent.
test.skip(!hasOpenAiKey, 'Requires OPENAI_API_KEY')

test('sends a chat message and receives a real AI response', async ({ page }) => {
  // Real OpenAI streaming can exceed 60s; extend the per-test timeout so the
  // assertion timeout cap (10s) is not hit while waiting for the send button to
  // reappear after streaming completes.
  test.setTimeout(180_000)

  await loginAsTestUser(page)
  await setFeatureFlags(page, { chat: true })
  await navigateTo(page, '/chat')

  // The /chat page does not emit a [data-hydrated="true"] marker; follow the same
  // hydration pattern as the existing chat specs (scroll into view + below-fold wait).
  await page.getByTestId('chat-input-textarea').scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  const assistantMessages = page.getByTestId('chat-message-assistant')
  const initialAssistantMessageCount = await assistantMessages.count()
  const expectedResponse = 'Voucha credentialed chat check passed.'

  await page
    .getByTestId('chat-input-textarea')
    .pressSequentially(`Reply with exactly: ${expectedResponse} Do not use tools.`)
  await page.getByTestId('chat-input-send-button').click()

  // Wait for URL to change to /chat/:id
  await page.waitForURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 })

  // Wait for the final assistant bubble instead of the transient abort button: a short live
  // response can finish before Playwright observes the streaming-only control.
  await assistantMessages.nth(initialAssistantMessageCount).waitFor({
    state: 'visible',
    timeout: 120_000,
  })
  const assistantMessage = assistantMessages.nth(initialAssistantMessageCount)
  await expect(assistantMessage).toBeVisible()
  const errorMessage = assistantMessage.getByTestId('chat-message-error')
  await expect(errorMessage).toHaveCount(0)
  await expect(assistantMessage.getByTestId('chat-message-content')).toContainText(
    'credentialed chat check passed',
  )
})
