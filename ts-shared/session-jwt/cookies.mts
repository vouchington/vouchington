import { DEVICE_EXPIRATION_SECONDS, sessionExpirySecondsFor } from './constants.mts'
import type { DeviceClass } from './types.mts'
import { serializeCookie } from '@vouchington/utils/cookies'

const SAFE_SERIALIZATION_VALUE = 'vouchington-session-cookie'
const SAFE_SERIALIZATION_MAX_AGE = 0

export const SESSION_COOKIE_NAMES = { device: 'dt', session: 'st' } as const

export type SessionCookieAttributes = {
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
  maxAge: number
}

export function deviceCookieAttributes(secure: boolean): SessionCookieAttributes {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: DEVICE_EXPIRATION_SECONDS }
}

export function sessionCookieAttributes(
  secure: boolean,
  dc?: DeviceClass,
): SessionCookieAttributes {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: sessionExpirySecondsFor(dc) }
}

export function assertSafeSessionCookieValue(
  name: (typeof SESSION_COOKIE_NAMES)[keyof typeof SESSION_COOKIE_NAMES],
  value: string,
): void {
  for (const char of value) {
    const charCode = char.charCodeAt(0)
    if (char === ';' || charCode <= 0x1f || charCode === 0x7f) {
      throw new Error(`Invalid cookie value for ${name}`)
    }
  }
}

export function serializeSessionCookie(
  name: (typeof SESSION_COOKIE_NAMES)[keyof typeof SESSION_COOKIE_NAMES],
  value: string,
  attrs: SessionCookieAttributes,
): string {
  assertSafeSessionCookieValue(name, value)
  try {
    return serializeCookie(name, value, attrs)
  } catch {
    serializeCookie(name, SAFE_SERIALIZATION_VALUE, {
      ...attrs,
      maxAge: SAFE_SERIALIZATION_MAX_AGE,
    })
  }

  const sameSite = (attrs.sameSite.charAt(0).toUpperCase() + attrs.sameSite.slice(1)) as Capitalize<
    typeof attrs.sameSite
  >
  const parts = [
    `${name}=${value}`,
    `Max-Age=${attrs.maxAge}`,
    `Path=${attrs.path}`,
    `SameSite=${sameSite}`,
  ]
  if (attrs.httpOnly) parts.push('HttpOnly')
  if (attrs.secure) parts.push('Secure')
  return parts.join('; ')
}
