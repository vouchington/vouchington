import { describe, it, expect, vi, beforeEach } from 'vitest'
import undici from 'undici'
import { fetchWithTimeout, type FetchWithTimeoutOptions } from '../http.mts'
import { getExternalRequestDispatcher } from '../http-dispatchers.mts'

type UndiciResponse = Awaited<ReturnType<typeof undici.fetch>>

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should successfully fetch a URL', async () => {
    const mockResponse = new Response('test', { status: 200 }) as unknown as UndiciResponse
    vi.spyOn(undici, 'fetch').mockResolvedValue(mockResponse)

    const options: FetchWithTimeoutOptions = {
      url: 'https://example.com',
      headers: { 'User-Agent': 'Test' },
      requestTimeoutMs: 5000,
      responseTimeoutMs: 5000,
    }

    const { response } = await fetchWithTimeout(options)

    expect(vi.mocked(undici.fetch)).toHaveBeenCalledWith('https://example.com', {
      dispatcher: getExternalRequestDispatcher(),
      headers: { 'User-Agent': 'Test' },
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    })
    expect(response).toBe(mockResponse)
  })

  it('should throw error on fetch failure', async () => {
    const error = new Error('Network error')
    vi.spyOn(undici, 'fetch').mockRejectedValue(error)

    const options: FetchWithTimeoutOptions = {
      url: 'https://example.com',
      headers: {},
      requestTimeoutMs: 5000,
      responseTimeoutMs: 5000,
    }

    await expect(fetchWithTimeout(options)).rejects.toThrow('Network error')
  })

  it('should use manual redirect mode', async () => {
    const mockResponse = new Response('', { status: 301 }) as unknown as UndiciResponse
    vi.spyOn(undici, 'fetch').mockResolvedValue(mockResponse)

    const options: FetchWithTimeoutOptions = {
      url: 'https://example.com',
      headers: {},
      requestTimeoutMs: 5000,
      responseTimeoutMs: 5000,
    }

    await fetchWithTimeout(options)

    expect(vi.mocked(undici.fetch)).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        redirect: 'manual',
      }),
    )
  })
})
