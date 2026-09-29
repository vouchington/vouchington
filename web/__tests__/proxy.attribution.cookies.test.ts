import {
  AUTH_ST_PAYLOAD,
  installProxyTestDoubles,
  makeRequest,
  mockCookiesSet,
  mockDecodeSessionJwt,
  resetProxyTestDoubles,
} from '@/test-helpers/proxy-session.mock-support'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import proxy from '../proxy'

describe('proxy response cookies', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = installProxyTestDoubles()
  })

  afterEach(() => {
    resetProxyTestDoubles()
  })

  it('sets dt and st cookies with correct attributes from backend session response', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'dt',
      'new-dt',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 2_592_000,
      }),
    )
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'st',
      'new-st',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 172_800,
      }),
    )
  })

  it('uses maxAge and secure from session response (backend is source of truth for auth)', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          session: {
            dt: 'new-dt',
            st: 'new-st',
            uid: null,
            dte: 86_400,
            ste: 3600,
            secure: true,
          },
        }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'dt',
      'new-dt',
      expect.objectContaining({ maxAge: 86_400, secure: true }),
    )
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'st',
      'new-st',
      expect.objectContaining({ maxAge: 3600, secure: true }),
    )
  })

  it('does not set cookies when no session', async () => {
    await proxy(makeRequest() as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies for anon session (worker handles Set-Cookie)', async () => {
    mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies when session response is missing dte', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ session: { dt: 'new-dt', st: 'new-st', ste: 172_800, secure: false } }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies when session response is missing ste', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ session: { dt: 'new-dt', st: 'new-st', dte: 2_592_000, secure: false } }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })

  it('does not set cookies when session response is missing secure', async () => {
    mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ session: { dt: 'new-dt', st: 'new-st', dte: 2_592_000, ste: 172_800 } }),
    })
    await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
    expect(mockCookiesSet).not.toHaveBeenCalled()
  })
})
