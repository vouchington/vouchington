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
  const maxAgeAttribute = attributes.find(value => value.trimStart().startsWith('Max-Age='))
  const maxAge = Number(maxAgeAttribute?.trimStart().slice('Max-Age='.length))

  expect(attributes.some(value => value.trimStart().startsWith('Expires='))).toBe(false)
  expect(signedExpiry).toEqual(expect.any(Number))
  expect(maxAgeAttribute).toBeDefined()
  expect(Number.isInteger(maxAge)).toBe(true)
  expect(maxAge).toBeGreaterThan(bounds.minRemainingSeconds)
  expect(maxAge).toBeLessThanOrEqual(bounds.maxRemainingSeconds)
  expect(Date.now() + maxAge * 1000).toBeLessThanOrEqual(signedExpiry! * 1000 + 1000)
}
