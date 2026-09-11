import { test, expect } from '../../helpers/test.mts'

import { AUTH_STATE } from '../../helpers/auth-state.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'

import { setFeatureFlags } from '../../helpers/feature-flags.mts'

import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Chat — support link feature flag', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows Support link when support feature flag is enabled', async ({ page }) => {
    await setFeatureFlags(page, { chat: true, support: true })
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('chat-support-link')).toBeVisible()
  })

  test('does not show Support link when support flag is disabled', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')

    await expect(page.getByTestId('chat-support-link')).toBeHidden()
  })

  test('Support link navigates to /chat/support', async ({ page }) => {
    await setFeatureFlags(page, { chat: true, support: true })
    await navigateTo(page, '/chat')

    const supportLink = page.getByTestId('chat-support-link')
    await expect(supportLink).toBeVisible()
    await expect(supportLink).toHaveAttribute('href', '/chat/support')
  })
})

test.describe('Chat — rename conversation', () => {
  test.use({ storageState: AUTH_STATE })

  test('rename button appears on hover and shows rename input', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')

    const convId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: 'Rename test chat' }),
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
    await conversationRow.getByTestId('chat-rename-button').click()

    await expect(page.getByTestId('chat-rename-input')).toBeVisible()
  })

  test('renaming a conversation updates its title in the sidebar', async ({ page }) => {
    await setFeatureFlags(page, { chat: true })
    await navigateTo(page, '/chat')
    const updatedTitle = `Updated title from test ${randomSuffix()}`

    const convId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: 'Old title for rename test' }),
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
    await conversationRow.getByTestId('chat-rename-button').click()

    const renameInput = page.getByTestId('chat-rename-input')
    await expect(renameInput).toBeVisible()

    await renameInput.fill('')
    await renameInput.pressSequentially(updatedTitle)

    const patchRequest = page.waitForRequest(
      req => req.url().includes(`/api/v1/my/conversations/${convId}`) && req.method() === 'PATCH',
    )
    await renameInput.press('Enter')
    await patchRequest

    await expect(
      page.getByTestId('chat-conversation-link').filter({ hasText: updatedTitle }),
    ).toBeVisible()
  })
})
