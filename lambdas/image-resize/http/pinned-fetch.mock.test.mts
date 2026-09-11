import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchWithPinnedDns } from './pinned-fetch.mts'
import { HttpOperationError } from '../errors.mts'

const mockSafeFetch = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock<typeof import('ssrf-guard/node')>(import('ssrf-guard/node'), async importOriginal => {
  const actual = await importOriginal<typeof import('ssrf-guard/node')>()
  return {
    ...actual,
    safeFetch: mockSafeFetch,
  }
})

const fakeResponse = { status: 200, ok: true } as never

describe('fetchWithPinnedDns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the response from safeFetch', async () => {
    mockSafeFetch.mockResolvedValue(fakeResponse)
    const signal = AbortSignal.timeout(5000)
    const result = await fetchWithPinnedDns('https://example.com/image.jpg', signal)
    expect(result).toBe(fakeResponse)
    expect(mockSafeFetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
      blockedHostnames: expect.objectContaining({ exact: expect.any(Array) }),
      signal,
      headers: { 'User-Agent': 'Voucha-Image-Resize/1.0' },
    })
  })

  it('maps UnsafeUrlError with private IP reason to HttpOperationError(403)', async () => {
    const { UnsafeUrlError } = await import('ssrf-guard/node')
    mockSafeFetch.mockRejectedValue(
      new UnsafeUrlError('https://10.0.0.1/', 'IP address is private: 10.0.0.1'),
    )
    const signal = AbortSignal.timeout(5000)
    const err = await fetchWithPinnedDns('https://10.0.0.1/', signal).catch(e => e)
    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
  })

  it('maps UnsafeUrlError with invalid URL reason to HttpOperationError(400)', async () => {
    const { UnsafeUrlError } = await import('ssrf-guard/node')
    mockSafeFetch.mockRejectedValue(new UnsafeUrlError('not-a-url', 'invalid URL'))
    const signal = AbortSignal.timeout(5000)
    const err = await fetchWithPinnedDns('not-a-url', signal).catch(e => e)
    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(400)
  })

  it('maps UnsafeUrlError with scheme not allowed reason to HttpOperationError(400)', async () => {
    const { UnsafeUrlError } = await import('ssrf-guard/node')
    mockSafeFetch.mockRejectedValue(
      new UnsafeUrlError('file:///etc/passwd', 'scheme not allowed: file:'),
    )
    const signal = AbortSignal.timeout(5000)
    const err = await fetchWithPinnedDns('file:///etc/passwd', signal).catch(e => e)
    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(400)
  })

  it('maps UnsafeUrlError with too-many-redirects reason to HttpOperationError(403)', async () => {
    const { UnsafeUrlError } = await import('ssrf-guard/node')
    mockSafeFetch.mockRejectedValue(
      new UnsafeUrlError('https://example.com/', 'too many redirects (max: 10)'),
    )
    const signal = AbortSignal.timeout(5000)
    const err = await fetchWithPinnedDns('https://example.com/', signal).catch(e => e)
    expect(err).toBeInstanceOf(HttpOperationError)
    expect((err as HttpOperationError).statusCode).toBe(403)
  })

  it('re-throws non-UnsafeUrlError errors unchanged', async () => {
    const networkError = new Error('Network failure')
    mockSafeFetch.mockRejectedValue(networkError)
    const signal = AbortSignal.timeout(5000)
    const err = await fetchWithPinnedDns('https://example.com/', signal).catch(e => e)
    expect(err).toBe(networkError)
  })
})
