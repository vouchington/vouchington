import { describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'

describe('CachedOrigin.purge', () => {
  it('forwards tags to ctx.cache.purge() and returns its result', async () => {
    const purgeSpy = vi.fn<
      (options: { tags?: string[] }) => Promise<{
        success: boolean
        errors: { code: number; message: string }[]
      }>
    >(() => Promise.resolve({ success: true, errors: [] }))
    const origin = new CachedOrigin(
      {
        props: { audience: 'anon', isRsc: false },
        waitUntil: () => {},
        passThroughOnException: () => {},
        cache: { purge: purgeSpy },
      },
      {},
    )

    const result = await origin.purge(['post:abc', 'topic:def'])

    expect(purgeSpy).toHaveBeenCalledWith({ tags: ['post:abc', 'topic:def'] })
    expect(result).toEqual({ success: true, errors: [] })
  })

  it('throws rather than silently no-opping when ctx.cache is unavailable', async () => {
    const origin = new CachedOrigin(
      {
        props: { audience: 'anon', isRsc: false },
        waitUntil: () => {},
        passThroughOnException: () => {},
      },
      {},
    )

    await expect(origin.purge(['post:abc'])).rejects.toThrow('Workers Cache purge API unavailable')
  })
})
