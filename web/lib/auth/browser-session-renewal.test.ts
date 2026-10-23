import { afterEach, describe, expect, it, vi } from 'vitest'
import { renewBrowserSession } from '../api/client/session-renewal'

describe('browser session renewal coordination', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('shares one renewal for concurrent callers and requests an exclusive browser lock', async () => {
    let release: () => void = () => {
      throw new Error('Lock was not acquired')
    }
    const admitted = new Promise<void>(resolve => {
      release = resolve
    })
    const request = vi.fn<
      (_name: string, _options: unknown, callback: () => Promise<boolean>) => Promise<boolean>
    >(async (_name: string, _options: unknown, callback: () => Promise<boolean>) => {
      await admitted
      return callback()
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ session: { uid: 'owned-user' } })))
    vi.stubGlobal('fetch', fetchMock)
    const first = renewBrowserSession()
    const second = renewBrowserSession()
    expect(second).toBe(first)
    expect(fetchMock).not.toHaveBeenCalled()
    release()
    await expect(first).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith(
      'voucha-session-renewal',
      expect.objectContaining({ mode: 'exclusive' }),
      expect.any(Function),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['missing', 'rejected'] as const)(
    'recovers through login when browser locks are %s',
    async condition => {
      vi.stubGlobal(
        'navigator',
        condition === 'missing'
          ? {}
          : { locks: { request: () => Promise.reject(new Error('Lock unavailable')) } },
      )
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)
      await expect(renewBrowserSession()).rejects.toBeInstanceOf(Error)
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        '/api/v1/session',
        expect.objectContaining({ method: 'DELETE' }),
      )
    },
  )
})
