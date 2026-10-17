import type { DnsClock } from '@vouchington/domain-verification'
import { it, expect, vi, beforeEach, afterEach, describe } from 'vitest'

const { mockResolveTxt } = vi.hoisted(() => ({
  mockResolveTxt: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('node:dns/promises')>(import('node:dns/promises'), () => ({
  resolveTxt: mockResolveTxt,
}))

describe('dns', () => {
  beforeEach(() => {
    vi.resetModules()
    mockResolveTxt.mockReset()
  })

  afterEach(() => {
    if (!vi.isFakeTimers()) return
    try {
      const pendingTimers = vi.getTimerCount()
      if (pendingTimers !== 0) {
        throw new Error(`DNS test left ${pendingTimers} pending fake timers`)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('joins split chunks within a single TXT record', async () => {
    mockResolveTxt.mockResolvedValueOnce([['chunk-one', 'chunk-two'], ['other=val']])
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    const result = await resolveTxtRecords('example.com')
    expect(result).toEqual(['chunk-onechunk-two', 'other=val'])
  })

  it('resolveTxtRecords returns flat records on first success', async () => {
    mockResolveTxt.mockResolvedValueOnce([['v=voucha-verification=abc123'], ['other=val']])
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    const result = await resolveTxtRecords('example.com')
    expect(result).toEqual(['v=voucha-verification=abc123', 'other=val'])
    expect(mockResolveTxt).toHaveBeenCalledTimes(1)
  })

  it('resolveTxtRecords retries on timeout then succeeds', async () => {
    const clock = createDnsClock()
    const timeout = new Promise<never>(() => {})
    mockResolveTxt
      .mockReturnValueOnce(timeout)
      .mockResolvedValueOnce([['voucha-site-verification=xyz']])
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    const pending = resolveTxtRecords('example.com', clock)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(mockResolveTxt).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    const result = await pending
    expect(result).toEqual(['voucha-site-verification=xyz'])
    expect(mockResolveTxt).toHaveBeenCalledTimes(2)
  })

  it('resolveTxtRecords throws DnsTimeoutError after all retries exhausted', async () => {
    const clock = createDnsClock()
    mockResolveTxt.mockReturnValue(new Promise<never>(() => {}))
    const { resolveTxtRecords, DnsTimeoutError } = await import('./domain-verification-dns.mts')

    const pending = resolveTxtRecords('example.com', clock)
    const settled = Promise.allSettled([pending])
    for (const attempt of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(4_999)
      expect(mockResolveTxt).toHaveBeenCalledTimes(attempt)
      await vi.advanceTimersByTimeAsync(1)
    }
    await settled
    await expect(pending).rejects.toMatchObject({
      cause: { name: 'DnsTimeoutError' },
      message: 'DNS TXT lookup timeout',
      name: DnsTimeoutError.name,
    })
    expect(mockResolveTxt).toHaveBeenCalledTimes(3)
  })

  it('resolveTxtRecords throws immediately on definitive DNS errors without retrying', async () => {
    const nxdomainError = new Error('queryTxt ENOTFOUND example.invalid')
    mockResolveTxt.mockRejectedValueOnce(nxdomainError)
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    await expect(resolveTxtRecords('example.invalid')).rejects.toThrow(nxdomainError)
    expect(mockResolveTxt).toHaveBeenCalledTimes(1)
  })

  it('resolveTxtRecords retries on timeout then throws on definitive error', async () => {
    const clock = createDnsClock()
    const nxdomainError = new Error('queryTxt ENOTFOUND example.invalid')
    const timeout = new Promise<never>(() => {})
    mockResolveTxt.mockReturnValueOnce(timeout).mockRejectedValueOnce(nxdomainError)
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    const pending = resolveTxtRecords('example.invalid', clock)
    const settled = Promise.allSettled([pending])
    await vi.advanceTimersByTimeAsync(4_999)
    expect(mockResolveTxt).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await settled
    await expect(pending).rejects.toThrow(nxdomainError)
    expect(mockResolveTxt).toHaveBeenCalledTimes(2)
  })
})

function createDnsClock(): DnsClock {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return { setTimeout, clearTimeout }
}
