import type { Page } from '@playwright/test'
import { generateTotpCode } from 'vouchington-tooling/playwright'

/**
 * Set up a real TOTP authenticator for the logged-in user via the API.
 * Returns the authenticator ID and secret so you can generate codes later.
 *
 * Note: Clean up with cleanupTotpAuthenticator() after your test to restore
 * the shared test user to a clean state.
 */
export async function setupTotpAuthenticator(
  page: Page,
  name: string,
): Promise<{ authenticatorId: string; secret: string }> {
  const setupData = await page.evaluate(async (authenticatorName: string) => {
    const resp = await fetch('/api/v1/auth/totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: authenticatorName }),
    })
    if (!resp.ok) throw new Error(`TOTP setup failed: ${resp.status}`)
    return resp.json() as Promise<{
      authenticator: { id: string; name: string }
      secret: string
      uri: string
    }>
  }, name)

  const code = await generateTotpCode(page, setupData.secret)

  await page.evaluate(
    async ({ id, verificationCode }: { id: string; verificationCode: string }) => {
      const resp = await fetch('/api/v1/auth/totp/setup/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ authenticator_id: id, code: verificationCode }),
      })
      if (!resp.ok) throw new Error(`TOTP verification failed: ${resp.status}`)
    },
    { id: setupData.authenticator.id, verificationCode: code },
  )

  return { authenticatorId: setupData.authenticator.id, secret: setupData.secret }
}

/**
 * Delete a TOTP authenticator by ID via the API.
 * Used to restore the shared test user to a clean state after tests.
 *
 * When the authenticator is the user's last MFA method, the backend requires a
 * re_auth_token. Pass `secret` (returned by setupTotpAuthenticator) so that
 * the function can generate a TOTP code, exchange it for a re-auth token via
 * POST /api/v1/auth/mfa/re-auth/totp/verification, and include it in the
 * DELETE request body.
 */
export async function cleanupTotpAuthenticator(
  page: Page,
  authenticatorId: string,
  secret?: string,
): Promise<void> {
  if (secret) {
    const code = await generateTotpCode(page, secret)
    const reAuthToken = await page.evaluate(async (totpCode: string) => {
      const resp = await fetch('/api/v1/auth/mfa/re-auth/totp/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: totpCode }),
      })
      if (!resp.ok) return null
      const data = (await resp.json()) as { re_auth_token?: string }
      return data.re_auth_token ?? null
    }, code)

    await page.evaluate(
      async ({ id, reAuth }: { id: string; reAuth: string | null }) => {
        await fetch(`/api/v1/auth/totp/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(reAuth ? { re_auth_token: reAuth } : {}),
        })
      },
      { id: authenticatorId, reAuth: reAuthToken },
    )
  } else {
    await page.evaluate(async (id: string) => {
      await fetch(`/api/v1/auth/totp/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    }, authenticatorId)
  }
}
