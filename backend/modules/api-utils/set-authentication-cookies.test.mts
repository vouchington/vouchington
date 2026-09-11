import { describe, it, expect } from 'vitest'
import { setAuthenticationCookies, COOKIE_OPTIONS } from './set-authentication-cookies.mts'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  DEVICE_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'

function makeCookiesSpy() {
  const calls: [string, string, Record<string, unknown>][] = []
  const set = (name: string, value: string, options: Record<string, unknown>) =>
    calls.push([name, value, options])
  return { ctx: { cookies: { set } } as any, calls }
}

describe('COOKIE_OPTIONS', () => {
  it('has httpOnly true', () => {
    expect(COOKIE_OPTIONS.httpOnly).toBe(true)
  })

  it('has sameSite lax', () => {
    expect(COOKIE_OPTIONS.sameSite).toBe('lax')
  })

  it('has path /', () => {
    expect(COOKIE_OPTIONS.path).toBe('/')
  })

  it('has secure false in test environment', () => {
    expect(COOKIE_OPTIONS.secure).toBe(false)
  })
})

describe('setAuthenticationCookies', () => {
  it.each([
    ['dt', 'bad;device-token'],
    ['dt', 'bad\ndevice-token'],
    ['dt', 'bad\x7fdevice-token'],
    ['st', 'bad;session-token'],
    ['st', 'bad\u0000session-token'],
  ] as const)('rejects unsafe %s cookie values', (cookieName, value) => {
    const { ctx, calls } = makeCookiesSpy()
    const tokens = {
      dt: cookieName === 'dt' ? value : 'device-token',
      st: cookieName === 'st' ? value : 'session-token',
    }

    expect(() => setAuthenticationCookies(ctx, tokens)).toThrow(
      `Invalid cookie value for ${cookieName}`,
    )
    expect(calls).toHaveLength(0)
  })

  it('sets dt and st cookies', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, { dt: 'device-token', st: 'session-token' })
    expect(calls).toHaveLength(2)
    expect(calls.some(c => c[0] === 'dt' && c[1] === 'device-token')).toBe(true)
    expect(calls.some(c => c[0] === 'st' && c[1] === 'session-token')).toBe(true)
  })

  it('dt cookie uses COOKIE_OPTIONS attributes', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, { dt: 'device-token', st: 'session-token' })
    const dtOptions = calls.find(c => c[0] === 'dt')![2]
    expect(dtOptions.httpOnly).toBe(COOKIE_OPTIONS.httpOnly)
    expect(dtOptions.secure).toBe(COOKIE_OPTIONS.secure)
    expect(dtOptions.sameSite).toBe(COOKIE_OPTIONS.sameSite)
    expect(dtOptions.path).toBe(COOKIE_OPTIONS.path)
  })

  it('st cookie uses COOKIE_OPTIONS attributes', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, { dt: 'device-token', st: 'session-token' })
    const stOptions = calls.find(c => c[0] === 'st')![2]
    expect(stOptions.httpOnly).toBe(COOKIE_OPTIONS.httpOnly)
    expect(stOptions.secure).toBe(COOKIE_OPTIONS.secure)
    expect(stOptions.sameSite).toBe(COOKIE_OPTIONS.sameSite)
    expect(stOptions.path).toBe(COOKIE_OPTIONS.path)
  })

  it('dt cookie uses maxAge of DEVICE_EXPIRATION_SECONDS', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, { dt: 'device-token', st: 'session-token' })
    const dtOptions = calls.find(c => c[0] === 'dt')![2]
    expect(dtOptions.maxAge).toBe(DEVICE_EXPIRATION_SECONDS)
  })

  it('st cookie uses maxAge of SESSION_EXPIRATION_SECONDS', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, { dt: 'device-token', st: 'session-token' })
    const stOptions = calls.find(c => c[0] === 'st')![2]
    expect(stOptions.maxAge).toBe(SESSION_EXPIRATION_SECONDS)
  })

  it('st cookie uses maxAge of ATTESTED_SESSION_EXPIRATION_SECONDS for an attested device', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, {
      dt: 'device-token',
      st: 'session-token',
      deviceClass: 'attested',
    })
    const stOptions = calls.find(c => c[0] === 'st')![2]
    expect(stOptions.maxAge).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    expect(stOptions.maxAge).not.toBe(SESSION_EXPIRATION_SECONDS)
  })

  it('dt cookie maxAge is unaffected by deviceClass', () => {
    const { ctx, calls } = makeCookiesSpy()
    setAuthenticationCookies(ctx, {
      dt: 'device-token',
      st: 'session-token',
      deviceClass: 'attested',
    })
    const dtOptions = calls.find(c => c[0] === 'dt')![2]
    expect(dtOptions.maxAge).toBe(DEVICE_EXPIRATION_SECONDS)
  })
})
