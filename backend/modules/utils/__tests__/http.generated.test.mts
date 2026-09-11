import { describe, it, expect } from 'vitest'
import { Response as UndiciResponse } from 'undici'
import {
  readResponseBody,
  handleHttpErrors,
  type ReadResponseBodyOptions,
  type HandleHttpErrorsOptions,
} from '../http.mts'

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

describe('handleHttpErrors', () => {
  it('should not throw for success status codes', () => {
    const mockResponse = {
      status: 200,
      body: null,
    } as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).not.toThrow()
  })

  it('should not throw for 3xx status codes', () => {
    const mockResponse = {
      status: 301,
      body: null,
    } as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).not.toThrow()
  })

  it('should not throw for 4xx status codes except 429', () => {
    const mockResponse = {
      status: 404,
      body: null,
    } as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).not.toThrow()
  })

  it('should throw for 429 rate limit', () => {
    const mockHeaders = new Headers()
    mockHeaders.set('retry-after', '60')

    const mockResponse = {
      status: 429,
      headers: mockHeaders,
      body: {
        cancel: () => {},
      },
    } as unknown as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).toThrow('Rate limited')
  })

  it('should throw for 500 server error', () => {
    const mockResponse = {
      status: 500,
      body: {
        cancel: () => {},
      },
    } as unknown as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).toThrow('Server error 500')
  })

  it('should throw for 503 server error', () => {
    const mockResponse = {
      status: 503,
      body: {
        cancel: () => {},
      },
    } as unknown as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).toThrow('Server error 503')
  })

  it('should cancel response body when throwing', () => {
    let cancelled = false
    const mockResponse = {
      status: 500,
      body: {
        cancel: () => {
          cancelled = true
        },
      },
    } as unknown as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    try {
      handleHttpErrors(options)
    } catch {
      // Expected to throw
    }

    expect(cancelled).toBe(true)
  })

  it('should include retry-after in error message for 429', () => {
    const mockHeaders = new Headers()
    mockHeaders.set('retry-after', '120')

    const mockResponse = {
      status: 429,
      headers: mockHeaders,
      body: {
        cancel: () => {},
      },
    } as unknown as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).toThrow('120000ms')
  })

  it('should handle null retry-after header', () => {
    const mockHeaders = new Headers()

    const mockResponse = {
      status: 429,
      headers: mockHeaders,
      body: {
        cancel: () => {},
      },
    } as unknown as Response

    const options: HandleHttpErrorsOptions = {
      response: mockResponse,
      url: 'https://example.com',
    }

    expect(() => handleHttpErrors(options)).toThrow('retry after null')
  })
})
