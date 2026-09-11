import { describe, expect, it } from 'vitest'
import {
  SESSION_COOKIE_NAMES,
  deviceCookieAttributes,
  sessionCookieAttributes,
  serializeSessionCookie,
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  DEVICE_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from './index.mts'

describe('SESSION_COOKIE_NAMES', () => {
  it('has device = dt and session = st', () => {
    expect(SESSION_COOKIE_NAMES.device).toBe('dt')
    expect(SESSION_COOKIE_NAMES.session).toBe('st')
  })
})

describe('deviceCookieAttributes', () => {
  it('returns correct attributes for insecure context', () => {
    const attrs = deviceCookieAttributes(false)
    expect(attrs).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: DEVICE_EXPIRATION_SECONDS,
    })
  })

  it('returns secure=true in production', () => {
    expect(deviceCookieAttributes(true).secure).toBe(true)
  })
})

describe('sessionCookieAttributes', () => {
  it('returns correct attributes for insecure context', () => {
    const attrs = sessionCookieAttributes(false)
    expect(attrs).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: SESSION_EXPIRATION_SECONDS,
    })
  })

  it('uses the attested 30-day maxAge when dc is attested', () => {
    const attrs = sessionCookieAttributes(false, 'attested')
    expect(attrs.maxAge).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    expect(attrs.maxAge).not.toBe(SESSION_EXPIRATION_SECONDS)
  })

  it('uses the default 2-day maxAge when dc is undefined', () => {
    const attrs = sessionCookieAttributes(false, undefined)
    expect(attrs.maxAge).toBe(SESSION_EXPIRATION_SECONDS)
  })
})

describe('serializeSessionCookie', () => {
  it('produces correct header string without Secure', () => {
    const attrs = sessionCookieAttributes(false)
    const header = serializeSessionCookie('st', 'token-value', attrs)
    expect(header).toBe(
      `st=token-value; Max-Age=${SESSION_EXPIRATION_SECONDS}; Path=/; SameSite=Lax; HttpOnly`,
    )
  })

  it('includes Secure when secure=true', () => {
    const attrs = deviceCookieAttributes(true)
    const header = serializeSessionCookie('dt', 'device-token', attrs)
    expect(header).toContain('Secure')
  })

  it('does not include Secure when secure=false', () => {
    const attrs = sessionCookieAttributes(false)
    const header = serializeSessionCookie('st', 'session-token', attrs)
    expect(header).not.toContain('Secure')
  })

  it('matches backend COOKIE_OPTIONS shape', () => {
    const attrs = sessionCookieAttributes(false)
    expect(attrs.httpOnly).toBe(true)
    expect(attrs.sameSite).toBe('lax')
    expect(attrs.path).toBe('/')
    expect(attrs.secure).toBe(false)
  })

  it('throws on semicolon in value', () => {
    const attrs = sessionCookieAttributes(false)
    expect(() => serializeSessionCookie('st', 'bad;value', attrs)).toThrow('Invalid cookie value')
  })

  it('throws on newline in value', () => {
    const attrs = sessionCookieAttributes(false)
    expect(() => serializeSessionCookie('st', 'bad\nvalue', attrs)).toThrow('Invalid cookie value')
  })

  it.each(['bad\rvalue', 'bad\u0000value', 'bad\u007fvalue'])(
    'throws on control character in value: %j',
    value => {
      const attrs = sessionCookieAttributes(false)
      expect(() => serializeSessionCookie('st', value, attrs)).toThrow('Invalid cookie value')
    },
  )

  it('preserves previously accepted non-control cookie values', () => {
    const attrs = sessionCookieAttributes(false)
    const value = 'value with space,quote"backslash\\café'

    expect(serializeSessionCookie('st', value, attrs)).toBe(
      `st=${value}; Max-Age=${SESSION_EXPIRATION_SECONDS}; Path=/; SameSite=Lax; HttpOnly`,
    )
  })

  it('retains cookie-name validation from the shared serializer', () => {
    const attrs = sessionCookieAttributes(true)
    expect(() => serializeSessionCookie('invalid name' as 'st', 'value', attrs)).toThrow(
      'Invalid cookie name',
    )
  })

  it.each([-1, 1.5])('preserves legacy Max-Age serialization for %s', maxAge => {
    const attrs = { ...sessionCookieAttributes(false), maxAge }

    expect(serializeSessionCookie('st', 'token-value', attrs)).toContain(`Max-Age=${maxAge}`)
  })
})
