import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser } from '../../helpers/auth.mts'
import { setupVirtualAuthenticator } from '../../helpers/virtual-authenticator.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('Passkey management', () => {
  test('adds and removes a passkey from identity page', async ({ page }) => {
    await setupVirtualAuthenticator(page)
    const passkeyName = `Playwright Test ${randomSuffix()}`

    await loginAsTestUser(page)
    await navigateTo(page, '/my/identity')
    const addPasskeyButton = page.getByTestId('add-passkey-button')
    await addPasskeyButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await addPasskeyButton.click()
    await page.getByTestId('passkey-name-input').fill(passkeyName)
    const createPasskeyButton = page.getByTestId('create-passkey-button')
    await createPasskeyButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await createPasskeyButton.click()
    await expect(page.locator('[data-sonner-toast]')).toContainText('Passkey added successfully')
    await expect(page.getByTestId('passkey-name').filter({ hasText: passkeyName })).toBeVisible()

    // Cleanup: delete the passkey added during this test
    await page.evaluate(async (name: string) => {
      const resp = await fetch('/api/v1/auth/passkeys', { credentials: 'include' })
      const data = (await resp.json()) as { results: Array<{ id: string; name: string }> }
      const pk = data.results.find(p => p.name === name)
      if (pk)
        await fetch(`/api/v1/auth/passkeys/${pk.id}`, { method: 'DELETE', credentials: 'include' })
    }, passkeyName)
  })
})
