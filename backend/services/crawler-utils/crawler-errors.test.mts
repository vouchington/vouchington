import { describe, expect, it } from 'vitest'
import {
  CrawlerNetworkError,
  CrawlerRateLimitError,
  CrawlerResponseSizeExceededError,
  CrawlerServerError,
  CrawlerTimeoutError,
  HttpNoBodyError,
} from '@modules/on-error/errors'
import { handleErrors, readBodyAsBuffer } from './index.mts'

describe('crawler utils errors', () => {
  const startedAt = new Date()

  it('maps HTTP status and body-size failures to crawler errors', async () => {
    expect(() =>
      handleErrors({
        response: new Response('ok', { status: 200 }),
        url: 'https://example.com/ok',
        crawlerType: 'html',
        startedAt,
      }),
    ).not.toThrow()
    expect(() =>
      handleErrors({
        response: new Response('', { status: 429, headers: { 'retry-after': '1' } }),
        url: 'https://example.com/limited',
        crawlerType: 'rss',
        startedAt,
      }),
    ).toThrow(CrawlerRateLimitError)
    expect(() =>
      handleErrors({
        response: new Response('', { status: 503 }),
        url: 'https://example.com/down',
        crawlerType: 'rss',
        startedAt,
      }),
    ).toThrow(CrawlerServerError)

    await expect(
      readBodyAsBuffer({
        response: new Response('too large'),
        url: 'https://example.com/large',
        maxSizeBytes: 3,
        timeoutMs: 1000,
        crawlerType: 'html',
        startedAt,
      }),
    ).rejects.toBeInstanceOf(CrawlerResponseSizeExceededError)
  })

  it('preserves no-body failures from body reads', async () => {
    const response = new Response(null, { status: 200 })
    const noBodyError = new HttpNoBodyError('https://example.com/no-body')

    await expect(
      readBodyAsBuffer({
        response,
        url: 'https://example.com/no-body',
        maxSizeBytes: 1000,
        timeoutMs: 1000,
        crawlerType: 'rss',
        startedAt,
        dependencies: {
          readResponseBodyAsBuffer: async () => {
            throw noBodyError
          },
        },
      }),
    ).rejects.toBe(noBodyError)
  })

  it('maps abort errors from body reads to crawler timeouts', async () => {
    const abortError = new Error('body read timed out')
    abortError.name = 'AbortError'
    const abortController = new AbortController()
    const readResponseBodyAsBuffer = async (options: { signal?: AbortSignal }) => {
      expect(options.signal).toBe(abortController.signal)
      throw abortError
    }

    await expect(
      readBodyAsBuffer({
        response: new Response('slow', { status: 200 }),
        url: 'https://example.com/slow',
        maxSizeBytes: 1000,
        timeoutMs: 1000,
        signal: abortController.signal,
        crawlerType: 'html',
        startedAt,
        dependencies: {
          readResponseBodyAsBuffer,
        },
      }),
    ).rejects.toBeInstanceOf(CrawlerTimeoutError)
  })

  it('maps deadline signal errors from body reads to crawler timeouts', async () => {
    const timeoutError = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    )

    await expect(
      readBodyAsBuffer({
        response: new Response('slow', { status: 200 }),
        url: 'https://example.com/slow',
        maxSizeBytes: 1000,
        timeoutMs: 1000,
        signal: AbortSignal.timeout(1000),
        crawlerType: 'rss',
        startedAt,
        dependencies: {
          readResponseBodyAsBuffer: async () => {
            throw timeoutError
          },
        },
      }),
    ).rejects.toBeInstanceOf(CrawlerTimeoutError)
  })

  it('maps body read errors to crawler network errors', async () => {
    await expect(
      readBodyAsBuffer({
        response: new Response('broken', { status: 200 }),
        url: 'https://example.com/broken',
        maxSizeBytes: 1000,
        timeoutMs: 1000,
        crawlerType: 'html',
        startedAt,
        dependencies: {
          readResponseBodyAsBuffer: async () => {
            throw new Error('socket closed')
          },
        },
      }),
    ).rejects.toBeInstanceOf(CrawlerNetworkError)
  })

  it('rethrows non-error body read failures', async () => {
    await expect(
      readBodyAsBuffer({
        response: new Response('broken', { status: 200 }),
        url: 'https://example.com/broken',
        maxSizeBytes: 1000,
        timeoutMs: 1000,
        crawlerType: 'html',
        startedAt,
        dependencies: {
          readResponseBodyAsBuffer: () => Promise.reject('read failed'),
        },
      }),
    ).rejects.toBe('read failed')
  })
})
