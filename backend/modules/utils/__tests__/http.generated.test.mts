import { describe, it, expect } from 'vitest'
import { Response as UndiciResponse } from 'undici'
import { readResponseBody } from '../http-body.mts'

type ReadResponseBodyOptions = Parameters<typeof readResponseBody>[0]

const createMockResponse = (body: string, chunkSize = body.length || 1): Response => {
  const encoder = new TextEncoder()
  const chunks =
    body.match(new RegExp(`.{1,${chunkSize}}`, 'g'))?.map(chunk => encoder.encode(chunk)) ?? []
  let index = 0

  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
  })

  return {
    body: stream,
  } as Response
}

describe('readResponseBody', () => {
  it('reads an Undici response body through the shared bounded reader', async () => {
    await expect(
      readResponseBody({
        response: new UndiciResponse('test content'),
        url: 'https://example.com',
        maxSizeBytes: 1000,
      }),
    ).resolves.toBe('test content')
  })

  it('should read response body successfully', async () => {
    const mockResponse = createMockResponse('test content')

    const options: ReadResponseBodyOptions = {
      response: mockResponse,
      url: 'https://example.com',
      maxSizeBytes: 1000,
    }

    const text = await readResponseBody(options)

    expect(text).toBe('test content')
  })

  it('should throw error when no response body', async () => {
    const mockResponse = {
      body: null,
    } as Response

    const options: ReadResponseBodyOptions = {
      response: mockResponse,
      url: 'https://example.com',
      maxSizeBytes: 1000,
    }

    await expect(readResponseBody(options)).rejects.toThrow(
      'No response body for https://example.com',
    )
  })

  it('should throw error when size limit exceeded', async () => {
    const longContent = 'a'.repeat(2000)
    const mockResponse = createMockResponse(longContent)

    const options: ReadResponseBodyOptions = {
      response: mockResponse,
      url: 'https://example.com',
      maxSizeBytes: 100,
    }

    await expect(readResponseBody(options)).rejects.toThrow('Response size exceeded limit')
  })

  it('should handle empty response body', async () => {
    const mockResponse = createMockResponse('')

    const options: ReadResponseBodyOptions = {
      response: mockResponse,
      url: 'https://example.com',
      maxSizeBytes: 1000,
    }

    const text = await readResponseBody(options)

    expect(text).toBe('')
  })

  it('should cancel a locked reader when the abort signal fires', async () => {
    const abortController = new AbortController()
    let cancelReason: unknown
    const mockResponse = {
      body: new ReadableStream<Uint8Array>({
        start: () => undefined,
        cancel(reason) {
          cancelReason = reason
        },
      }),
    } as Response
    const reason = new Error('stop reading')

    const readPromise = readResponseBody({
      response: mockResponse,
      url: 'https://example.com',
      maxSizeBytes: 1000,
      signal: abortController.signal,
    })
    abortController.abort(reason)

    await expect(readPromise).rejects.toThrow('stop reading')
    expect(cancelReason).toBe(reason)
  })

  it('should read many chunks without recursive stack growth', async () => {
    const body = 'a'.repeat(10_000)
    const mockResponse = createMockResponse(body, 1)

    const options: ReadResponseBodyOptions = {
      response: mockResponse,
      url: 'https://example.com',
      maxSizeBytes: 20_000,
    }

    await expect(readResponseBody(options)).resolves.toBe(body)
  })
})
