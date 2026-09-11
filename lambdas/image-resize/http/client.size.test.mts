import { describe, it, expect, vi } from 'vitest'
import { fetchImageFromUrl } from './client.mts'
import { HttpOperationError } from '../errors.mts'

const mockFetchWithPinnedDns = vi.fn<VitestLooseMock>()

function chunkedImageResponse(chunks: Uint8Array[]) {
  const cancel = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
      },
      cancel,
    }),
    cancel,
    headers: {
      get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null),
    },
  }
}

describe('fetchImageFromUrl size limits', () => {
  it('rejects a body that exceeds max size mid-stream and cancels', async () => {
    const response = chunkedImageResponse([Buffer.from('123456'), Buffer.from('123456')])
    mockFetchWithPinnedDns.mockResolvedValue(response as never)

    const error = await fetchImageFromUrl('https://example.com/image.jpg', 30000, 10, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HttpOperationError)
    expect((error as HttpOperationError).statusCode).toBe(413)
    expect(response.cancel).toHaveBeenCalled()
  })

  it('rejects a response with no body', async () => {
    mockFetchWithPinnedDns.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: null,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null),
      },
    } as never)

    const error = await fetchImageFromUrl('https://example.com/image.jpg', 30000, 1024, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HttpOperationError)
    expect((error as HttpOperationError).statusCode).toBe(500)
  })

  it('times out while streaming the body, not only time-to-headers', async () => {
    mockFetchWithPinnedDns.mockImplementation(async (_url: URL, signal: AbortSignal) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: {
        cancel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        async *[Symbol.asyncIterator]() {
          yield new Uint8Array([1])
          await new Promise<never>((_, reject) => {
            const abort = () => {
              const error = new Error('The operation was aborted')
              error.name = 'AbortError'
              reject(error)
            }
            if (signal.aborted) abort()
            else signal.addEventListener('abort', abort, { once: true })
          })
        },
      },
      headers: {
        get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null),
      },
    }))

    const error = await fetchImageFromUrl('https://example.com/image.jpg', 20, 1024, {
      fetchWithPinnedDns: mockFetchWithPinnedDns,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(HttpOperationError)
    expect((error as HttpOperationError).statusCode).toBe(504)
  })
})
