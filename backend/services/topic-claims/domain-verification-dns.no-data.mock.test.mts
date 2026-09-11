import { it, expect, vi, beforeEach, describe } from 'vitest'

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
    const timeout = new Promise<never>(() => {})
    mockResolveTxt
      .mockReturnValueOnce(timeout)
      .mockResolvedValueOnce([['voucha-site-verification=xyz']])
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    const result = await resolveTxtRecords('example.com')
    expect(result).toEqual(['voucha-site-verification=xyz'])
    expect(mockResolveTxt).toHaveBeenCalledTimes(2)
  }, 15_000)

  it('resolveTxtRecords throws DnsTimeoutError after all retries exhausted', async () => {
    mockResolveTxt.mockReturnValue(new Promise<never>(() => {}))
    const { resolveTxtRecords, DnsTimeoutError } = await import('./domain-verification-dns.mts')

    await expect(resolveTxtRecords('example.com')).rejects.toMatchObject({
      cause: { name: 'DnsTimeoutError' },
      message: 'DNS TXT lookup timeout',
      name: DnsTimeoutError.name,
    })
    expect(mockResolveTxt).toHaveBeenCalledTimes(3)
  }, 30_000)

  it('resolveTxtRecords throws immediately on definitive DNS errors without retrying', async () => {
    const nxdomainError = new Error('queryTxt ENOTFOUND example.invalid')
    mockResolveTxt.mockRejectedValueOnce(nxdomainError)
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    await expect(resolveTxtRecords('example.invalid')).rejects.toThrow(nxdomainError)
    expect(mockResolveTxt).toHaveBeenCalledTimes(1)
  })

  it('resolveTxtRecords retries on timeout then throws on definitive error', async () => {
    const nxdomainError = new Error('queryTxt ENOTFOUND example.invalid')
    const timeout = new Promise<never>(() => {})
    mockResolveTxt.mockReturnValueOnce(timeout).mockRejectedValueOnce(nxdomainError)
    const { resolveTxtRecords } = await import('./domain-verification-dns.mts')

    await expect(resolveTxtRecords('example.invalid')).rejects.toThrow(nxdomainError)
    expect(mockResolveTxt).toHaveBeenCalledTimes(2)
  }, 15_000)
})
