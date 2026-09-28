import {
  AUTH_ST_PAYLOAD,
  consoleSpy,
  installProxyTestDoubles,
  makeRequest,
  mockDecodeSessionJwt,
  mockNextResponseNext,
  resetProxyTestDoubles,
} from '@/test-helpers/proxy-session.mock-support'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import proxy from '../proxy'

describe('proxy.session', () => {
  afterAll(() => {
    consoleSpy.mockRestore()
  })

  describe('proxy', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = installProxyTestDoubles()
    })

    afterEach(() => {
      resetProxyTestDoubles()
    })

    describe('JWT request forwarding', () => {
      it('sets only cookie headers from backend session data', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-session-token')).toBeNull()
        expect(headers.get('x-user-id')).toBeNull()
        expect(headers.get('cookie')).toBe('dt=new-dt; st=new-st')
      })

      it('sets only cookie from inbound cookies for anon', async () => {
        mockDecodeSessionJwt.mockReturnValue({ uid: null, did: 'did-1', sid: 'sid-1' })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-session-token')).toBeNull()
        expect(headers.get('cookie')).toBe('dt=my-dt; st=my-st')
      })

      it('does not set x-user-id when uid is in backend session', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
      })

      it('replaces cookie header with only dt/st, dropping other browser cookies', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        await proxy(
          makeRequest({
            cookies: { dt: 'my-dt', st: 'my-st', 'other-cookie': 'value', 'feature-flag': 'on' },
          }) as any,
        )
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('cookie')).toBe('dt=new-dt; st=new-st')
      })

      it('omits x-user-id when uid is null from backend session', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              session: {
                dt: 'new-dt',
                st: 'new-st',
                uid: null,
                dte: 2_592_000,
                ste: 172_800,
                secure: false,
              },
            }),
        })
        await proxy(makeRequest({ cookies: { dt: 'my-dt', st: 'my-st' } }) as any)
        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('x-user-id')).toBeNull()
      })

      it('drops inbound auth cookies and headers when decoded st looks authenticated but backend validation fails', async () => {
        mockDecodeSessionJwt.mockReturnValue(AUTH_ST_PAYLOAD)
        fetchMock.mockResolvedValue({ ok: false })

        await proxy(
          makeRequest({
            cookies: { dt: 'my-dt', st: 'my-st' },
            headers: {
              'x-device-token': 'injected-device',
              'x-session-token': 'injected-session',
              'x-user-id': 'injected-user',
            },
          }) as any,
        )

        const headers = (mockNextResponseNext.mock as any).calls[0][0].request.headers as Headers
        expect(headers.get('cookie')).toBeNull()
        expect(headers.get('x-device-token')).toBeNull()
        expect(headers.get('x-session-token')).toBeNull()
        expect(headers.get('x-user-id')).toBeNull()
      })
    })
  })
})
