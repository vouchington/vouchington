import { expect } from 'vitest'
import { decodeSessionJwt } from '../../../ts-shared/session-jwt/index.mts'

/** Assert the actual Set-Cookie expiry stays inside its signed session lifetime. */
export function expectSessionCookieExpiry(
  cookieHeader: string[] | undefined,
  bounds: { minRemainingSeconds: number; maxRemainingSeconds: number },
): void {
  const cookie = cookieHeader?.find(value => value.startsWith('st='))
  expect(cookie).toBeDefined()
  const [tokenPair, ...attributes] = cookie!.split(';')
  const token = decodeURIComponent(tokenPair!.slice(3))
  const signedExpiry = decodeSessionJwt(token)?.exp
  const expiresAttribute = attributes.find(value => value.trimStart().startsWith('Expires='))
  const cookieExpiry = Date.parse(expiresAttribute?.trimStart().slice('Expires='.length) ?? '')

  expect(attributes.some(value => value.trimStart().startsWith('Max-Age='))).toBe(false)
  expect(signedExpiry).toEqual(expect.any(Number))
  expect(Number.isFinite(cookieExpiry)).toBe(true)
  expect(cookieExpiry).toBeLessThanOrEqual(signedExpiry! * 1000)
  expect(cookieExpiry).toBeGreaterThanOrEqual(signedExpiry! * 1000 - 1000)
  expect(cookieExpiry - Date.now()).toBeGreaterThan(bounds.minRemainingSeconds * 1000)
  expect(cookieExpiry - Date.now()).toBeLessThanOrEqual(bounds.maxRemainingSeconds * 1000)
}
