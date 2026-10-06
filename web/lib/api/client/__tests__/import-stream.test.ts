import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../error'
import { streamImportProgress, type ImportProgress } from '../import-stream'

function importResponse(overrides?: Partial<ImportProgress>): Response {
  const completed = overrides?.completed ?? 2
  const failed = overrides?.failed ?? 0
  const total = overrides?.total ?? 2
  const done = overrides?.done ?? true
  return Response.json({
    import: {
      id: overrides?.batchId ?? 'import-1',
      completed_rows: completed,
      failed_rows: failed,
      total_rows: total,
      pending_rows: done ? 0 : total - completed - failed,
      completed_at: done ? '2026-05-31T00:00:00.000Z' : null,
    },
    rows: [],
  })
}

describe('streamImportProgress', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('calls onProgress with status endpoint progress', async () => {
    vi.stubGlobal('fetch', vi.fn<VitestLooseMock>().mockResolvedValue(importResponse()))

    const received: ImportProgress[] = []
    await streamImportProgress('import-1', progress => received.push(progress))

    expect(received).toEqual([
      { batchId: 'import-1', completed: 2, failed: 0, total: 2, done: true },
    ])
  })

  it('throws ApiError on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(new Response('Not Found', { status: 404 })),
    )

    await expect(streamImportProgress('import-1', () => {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    } satisfies Partial<ApiError>)
  })

  it('uses the import id in the fetch URL', async () => {
    const mockFetch = vi.fn<VitestLooseMock>().mockResolvedValue(importResponse())
    vi.stubGlobal('fetch', mockFetch)

    await streamImportProgress('test-import-id-123', () => {})

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/my/import/rss-feeds/test-import-id-123'),
      expect.any(Object),
    )
  })

  it('continues polling until a later status response completes', async () => {
    vi.useFakeTimers()
    const mockFetch = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(importResponse({ completed: 1, total: 2, done: false }))
      .mockResolvedValueOnce(importResponse({ completed: 2, total: 2, done: true }))
    vi.stubGlobal('fetch', mockFetch)

    const received: ImportProgress[] = []
    const firstProgress = Promise.withResolvers<void>()
    const promise = streamImportProgress('import-1', progress => {
      received.push(progress)
      firstProgress.resolve()
    })

    await firstProgress.promise
    expect(received).toEqual([
      { batchId: 'import-1', completed: 1, failed: 0, total: 2, done: false },
    ])

    await vi.advanceTimersByTimeAsync(2000)
    await promise

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(received).toEqual([
      { batchId: 'import-1', completed: 1, failed: 0, total: 2, done: false },
      { batchId: 'import-1', completed: 2, failed: 0, total: 2, done: true },
    ])
  })

  it('rejects with AbortError when aborted during interval polling', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi
        .fn<VitestLooseMock>()
        .mockResolvedValue(importResponse({ completed: 0, total: 1, done: false })),
    )
    const controller = new AbortController()
    const polled = Promise.withResolvers<void>()

    const promise = streamImportProgress(
      'import-1',
      () => {
        polled.resolve()
      },
      controller.signal,
    )
    const promiseRejection = promise.catch((err: unknown) => err)
    await polled.promise
    expect(fetch).toHaveBeenCalledTimes(1)

    controller.abort()

    await expect(promiseRejection).resolves.toMatchObject({ name: 'AbortError' })
  })

  it('rides out transient poll failures and completes', async () => {
    vi.useFakeTimers()
    const mockFetch = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(importResponse({ completed: 0, total: 1, done: false }))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(importResponse({ completed: 1, total: 1, done: true }))
    vi.stubGlobal('fetch', mockFetch)

    const polled = Promise.withResolvers<void>()
    const promise = streamImportProgress('import-1', () => {
      polled.resolve()
    })
    await polled.promise
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6000)
    await promise

    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('rejects when an interval poll fails repeatedly', async () => {
    vi.useFakeTimers()
    const mockFetch = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(importResponse({ completed: 0, total: 1, done: false }))
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
    vi.stubGlobal('fetch', mockFetch)

    const polled = Promise.withResolvers<void>()
    const promise = streamImportProgress('import-1', () => {
      polled.resolve()
    })
    let caughtError: unknown
    const handledPromise = promise.catch((err: unknown) => {
      caughtError = err
    })
    await polled.promise
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6000)
    await handledPromise

    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(caughtError).toMatchObject({
      name: 'ApiError',
      status: 503,
    } satisfies Partial<ApiError>)
  })

  it('rejects immediately on a non-transient poll failure', async () => {
    vi.useFakeTimers()
    const mockFetch = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(importResponse({ completed: 0, total: 1, done: false }))
      .mockResolvedValueOnce(new Response('gone', { status: 404 }))
    vi.stubGlobal('fetch', mockFetch)

    const polled = Promise.withResolvers<void>()
    const promise = streamImportProgress('import-1', () => {
      polled.resolve()
    })
    const handled = promise.catch((err: unknown) => err)
    await polled.promise
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)

    await expect(handled).resolves.toMatchObject({ status: 404 })
  })
})
