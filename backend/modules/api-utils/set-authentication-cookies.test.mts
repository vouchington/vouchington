import { describe, it, expect } from 'vitest'
import { setAuthenticationCookies, COOKIE_OPTIONS } from './set-authentication-cookies.mts'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
  signDeviceJwt,
  signSessionJwt,
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

  it('dt cookie retains the signed device token expiry', async () => {
    const { ctx, calls } = makeCookiesSpy()
    const remainingSeconds = 120
    const dt = await signDeviceJwt(
      { did: '0194a541-7b19-7ccf-9afa-7087b692841c' },
      { expiresIn: new Date(Date.now() + remainingSeconds * 1000) },
    )
    setAuthenticationCookies(ctx, { dt, st: 'session-token' })
    const dtOptions = calls.find(c => c[0] === 'dt')![2]
    expect(dtOptions.maxAge).toBeGreaterThanOrEqual(remainingSeconds - 1)
    expect(dtOptions.maxAge).toBeLessThanOrEqual(remainingSeconds)
  })

  it('st cookie expires at the signed expiry after delayed issuance or exact replay', async () => {
    const { ctx, calls } = makeCookiesSpy()
    const now = Math.floor(Date.now() / 1000)
    const expiry = now + 120
    const st = await signSessionJwt(
      {
        did: '0194a541-7b19-7ccf-9afa-7087b692841c',
        sid: '0194a541-7b19-7ccf-9afa-7087b692841d',
        uid: null,
        client: 'web',
      },
      { issuedAt: now - 480, expiresIn: expiry },
    )
    setAuthenticationCookies(ctx, { dt: 'device-token', st })
    const stOptions = calls.find(c => c[0] === 'st')![2]
    expect(stOptions.expires).toEqual(new Date(expiry * 1000))
    expect(stOptions.maxAge).toBeUndefined()
  })

  it('st cookie cannot outlive the attested session limit', async () => {
    const { ctx, calls } = makeCookiesSpy()
    const now = Math.floor(Date.now() / 1000)
    const st = await signSessionJwt(
      {
        did: '0194a541-7b19-7ccf-9afa-7087b692841c',
        sid: '0194a541-7b19-7ccf-9afa-7087b692841d',
        uid: null,
      },
      { issuedAt: now, expiresIn: now + ATTESTED_SESSION_EXPIRATION_SECONDS + 120 },
    )
    setAuthenticationCookies(ctx, {
      dt: 'device-token',
      st,
      deviceClass: 'attested',
    })
    const stOptions = calls.find(c => c[0] === 'st')![2]
    expect((stOptions.expires as Date).getTime()).toBeLessThanOrEqual(
      Date.now() + ATTESTED_SESSION_EXPIRATION_SECONDS * 1000,
    )
    expect((stOptions.expires as Date).getTime()).toBeGreaterThan(
      Date.now() + SESSION_EXPIRATION_SECONDS * 1000,
    )
    expect(stOptions.maxAge).toBeUndefined()
  })

  it('dt cookie lifetime cannot be extended by deviceClass', async () => {
    const { ctx, calls } = makeCookiesSpy()
    const dt = await signDeviceJwt(
      { did: '0194a541-7b19-7ccf-9afa-7087b692841c' },
      { expiresIn: new Date(Date.now() + 120_000) },
    )
    setAuthenticationCookies(ctx, {
      dt,
      st: 'session-token',
      deviceClass: 'attested',
    })
    const dtOptions = calls.find(c => c[0] === 'dt')![2]
    expect(dtOptions.maxAge).toBeLessThanOrEqual(120)
    expect(dtOptions.maxAge).toBeGreaterThanOrEqual(119)
  })
})
