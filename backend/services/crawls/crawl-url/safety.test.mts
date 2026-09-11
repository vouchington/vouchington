import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CrawlerNetworkError,
  CrawlerSsrfError,
  CrawlerTimeoutError,
} from '@modules/on-error/errors'
import { type validateUrl as validateSafeUrl } from 'ssrf-guard/node'
import { resolveSafeCrawlerAddresses } from './safety.mts'

class TestUnsafeUrlError extends Error {
  rawUrl: string
  reason: string
  constructor(rawUrl: string, reason: string) {
    super(`Unsafe URL: ${reason} (${rawUrl})`)
    this.name = 'UnsafeUrlError'
    this.rawUrl = rawUrl
    this.reason = reason
  }
}

const mockValidateUrl = vi.fn<typeof validateSafeUrl>()

const makeDependencies = () => ({
  validateUrl: mockValidateUrl,
  unsafeUrlError: TestUnsafeUrlError,
})

describe('resolveSafeCrawlerAddresses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes the caller timeoutMs through to validateUrl', async () => {
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    mockValidateUrl.mockResolvedValueOnce(resolvedAddresses)

    await expect(
      resolveSafeCrawlerAddresses('https://example.com/', {
        timeoutMs: 2000,
        dependencies: makeDependencies(),
      }),
    ).resolves.toEqual(resolvedAddresses)

    expect(mockValidateUrl).toHaveBeenCalledWith('https://example.com/', { timeoutMs: 2000 })
  })

  it('defaults to a bounded DNS timeout when the caller passes none', async () => {
    const resolvedAddresses = [{ address: '93.184.216.34', family: 4 as const }]
    mockValidateUrl.mockResolvedValueOnce(resolvedAddresses)

    await resolveSafeCrawlerAddresses('https://example.com/', { dependencies: makeDependencies() })

    expect(mockValidateUrl).toHaveBeenCalledOnce()
    const [, options] = mockValidateUrl.mock.calls[0]!
    expect(options?.timeoutMs).toBeGreaterThan(0)
  })

  it('wraps UnsafeUrlError as CrawlerSsrfError', async () => {
    mockValidateUrl.mockRejectedValueOnce(new TestUnsafeUrlError('https://10.0.0.1/', 'private IP'))

    await expect(
      resolveSafeCrawlerAddresses('https://10.0.0.1/', { dependencies: makeDependencies() }),
    ).rejects.toBeInstanceOf(CrawlerSsrfError)
  })

  it('wraps a DNS resolution timeout (AbortError) as CrawlerTimeoutError', async () => {
    const timeoutError = new Error('DNS lookup for example.com timed out after 5000ms')
    timeoutError.name = 'AbortError'
    mockValidateUrl.mockRejectedValueOnce(timeoutError)

    await expect(
      resolveSafeCrawlerAddresses('https://example.com/', {
        timeoutMs: 5000,
        dependencies: makeDependencies(),
      }),
    ).rejects.toBeInstanceOf(CrawlerTimeoutError)
  })

  it('wraps an unrelated DNS failure as CrawlerNetworkError, not CrawlerTimeoutError', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), {
      code: 'ENOTFOUND',
    })
    mockValidateUrl.mockRejectedValueOnce(dnsError)

    await expect(
      resolveSafeCrawlerAddresses('https://example.com/', { dependencies: makeDependencies() }),
    ).rejects.toBeInstanceOf(CrawlerNetworkError)
  })

  it('wraps a non-Error validation failure as CrawlerNetworkError instead of throwing it raw', async () => {
    mockValidateUrl.mockRejectedValueOnce('boom')

    await expect(
      resolveSafeCrawlerAddresses('https://example.com/', { dependencies: makeDependencies() }),
    ).rejects.toBeInstanceOf(CrawlerNetworkError)
  })
})
