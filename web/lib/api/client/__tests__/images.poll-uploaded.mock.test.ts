import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  ImageBlockedError,
  ImageProcessingTimeoutError,
  POLL_INTERVAL_MS,
  pollImageUntilUploaded,
} from '../images'
import { ApiError } from '../../error'
import { flushMicrotasks, makeState, MockEventSource } from '../test-helpers/images'

const mockGet = vi.mocked(clientApi.get)

describe('images', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('pollImageUntilUploaded', () => {
    it('resolves when the image upload is complete even if moderation is pending', async () => {
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({ upload_status: 'complete', ready: false }),
      })
      const result = await pollImageUntilUploaded('img-1', { timeoutMs: 5000 })
      expect(result.upload_status).toBe('complete')
      expect(result.ready).toBe(false)
    })

    it('resolves when the image is already ready even if upload status lags', async () => {
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({ upload_status: 'processing', ready: true }),
      })
      const result = await pollImageUntilUploaded('img-1', { timeoutMs: 5000 })
      expect(result.ready).toBe(true)
    })

    it('waits through processing states then resolves on upload completion', async () => {
      mockGet.mockResolvedValueOnce({ upload_state: makeState() }).mockResolvedValueOnce({
        upload_state: makeState({ upload_status: 'complete', ready: false }),
      })
      const promise = pollImageUntilUploaded('img-1', { timeoutMs: 5000 })
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      const result = await promise
      expect(result.upload_status).toBe('complete')
    })

    it('honors Retry-After on 429 responses while polling upload completion', async () => {
      mockGet
        .mockRejectedValueOnce(new ApiError('rate limited', 429, { retry_after: 4 }))
        .mockResolvedValueOnce({
          upload_state: makeState({ upload_status: 'complete', ready: false }),
        })

      const promise = pollImageUntilUploaded('img-1', { timeoutMs: 10_000 })
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      expect(mockGet).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(4000 - POLL_INTERVAL_MS)

      const result = await promise
      expect(result.upload_status).toBe('complete')
      expect(mockGet).toHaveBeenCalledTimes(2)
    })

    it('does not count Retry-After backoff against the upload timeout', async () => {
      mockGet
        .mockRejectedValueOnce(new ApiError('rate limited', 429, { retry_after: 4 }))
        .mockResolvedValueOnce({
          upload_state: makeState({ upload_status: 'complete', ready: false }),
        })

      const promise = pollImageUntilUploaded('img-1', { timeoutMs: 1000 })
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(4000)

      const result = await promise
      expect(result.upload_status).toBe('complete')
    })

    it('recovers after retryable upload-state errors without Retry-After', async () => {
      mockGet
        .mockRejectedValueOnce(new ApiError('server error', 500))
        .mockRejectedValueOnce(new ApiError('server error', 500))
        .mockResolvedValueOnce({
          upload_state: makeState({ upload_status: 'complete', ready: false }),
        })

      const promise = pollImageUntilUploaded('img-1', { timeoutMs: 10_000 })
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

      const result = await promise
      expect(result.upload_status).toBe('complete')
      expect(mockGet).toHaveBeenCalledTimes(3)
    })

    it('rejects after too many retryable upload-state errors', async () => {
      mockGet
        .mockRejectedValueOnce(new ApiError('server error', 500))
        .mockRejectedValueOnce(new ApiError('server error', 500))
        .mockRejectedValueOnce(new ApiError('server error', 500))

      const promise = pollImageUntilUploaded('img-1', { timeoutMs: 10_000 })
      promise.catch(() => {})
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

      await expect(promise).rejects.toMatchObject({ name: 'ApiError', status: 500 })
      expect(mockGet).toHaveBeenCalledTimes(3)
    })

    it('aborts an in-flight upload-state request when the caller aborts', async () => {
      const controller = new AbortController()
      mockGet.mockImplementationOnce((_path: string, options?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      })

      const promise = pollImageUntilUploaded('img-1', {
        signal: controller.signal,
        timeoutMs: 10_000,
      })
      promise.catch(() => {})
      await flushMicrotasks()
      controller.abort()

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('aborts while waiting between upload-state polls', async () => {
      const controller = new AbortController()
      mockGet.mockResolvedValueOnce({ upload_state: makeState() })

      const promise = pollImageUntilUploaded('img-1', {
        signal: controller.signal,
        timeoutMs: 10_000,
      })
      promise.catch(() => {})
      await flushMicrotasks()
      controller.abort()

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('times out when an upload-state request stalls', async () => {
      mockGet.mockImplementationOnce((_path: string, options?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      })

      const promise = pollImageUntilUploaded('img-1', { timeoutMs: 1000 })
      promise.catch(() => {})
      await vi.advanceTimersByTimeAsync(1000)
      await expect(promise).rejects.toBeInstanceOf(ImageProcessingTimeoutError)
    })

    it('throws ImageBlockedError when moderation has already blocked the image', async () => {
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({ id: 'img-2', blocked: true, upload_status: 'complete' }),
      })
      await expect(pollImageUntilUploaded('img-2', { timeoutMs: 5000 })).rejects.toBeInstanceOf(
        ImageBlockedError,
      )
    })
  })
})
