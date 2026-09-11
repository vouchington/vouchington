import type { Page } from '@playwright/test'

/**
 * Generate a TOTP code using WebCrypto in the browser context.
 * Uses SHA-1 HMAC with 6-digit output and 30-second period (RFC 6238).
 */
export function generateTotpCode(page: Page, base32Secret: string): Promise<string> {
  return page.evaluate(async (secret: string) => {
    const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const BASE32_MAP = new Map([...BASE32].map((ch, i) => [ch, i]))
    const upper = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')

    let bits = ''
    for (const c of upper) {
      const idx = BASE32_MAP.get(c)
      if (idx !== undefined) bits += idx.toString(2).padStart(5, '0')
    }
    const bytes: number[] = []
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2))
    }

    const counter = Math.floor(Date.now() / 1000 / 30)
    const counterBytes = new Uint8Array(8)
    let rem = counter
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = rem & 0xff
      rem = Math.floor(rem / 256)
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(bytes),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    )
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes))
    const offset = sig[19] & 0x0f
    const code =
      (((sig[offset] & 0x7f) << 24) |
        ((sig[offset + 1] & 0xff) << 16) |
        ((sig[offset + 2] & 0xff) << 8) |
        (sig[offset + 3] & 0xff)) %
      1_000_000
    return String(code).padStart(6, '0')
  }, base32Secret)
}

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
