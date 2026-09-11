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
import { pollImageUntilTerminal } from '../images'
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

  describe('pollImageUntilTerminal', () => {
    it('ignores native connection error events that carry no data', async () => {
      mockGet.mockResolvedValueOnce({
        upload_state: makeState(),
      })
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      // Native error without data — should not settle the promise
      es.emitConnectionError()
      // The stream is still open; a state event resolves normally
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))
      const result = await promise
      expect(result.ready).toBe(true)
    })

    it('resolves from REST probe when the stream cannot open after completion', async () => {
      mockGet.mockResolvedValueOnce({
        upload_state: makeState({ ready: true, upload_status: 'complete' }),
      })

      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emitConnectionError()

      const result = await promise
      expect(result.ready).toBe(true)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/images/img-1/upload-state', {
        signal: undefined,
      })
    })

    it('resets stream-open REST probe errors after a valid state event', async () => {
      mockGet
        .mockRejectedValueOnce(new ApiError('temporary outage', 503))
        .mockRejectedValueOnce(new ApiError('temporary outage', 503))
        .mockRejectedValueOnce(new ApiError('temporary outage', 503))

      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!

      es.emitConnectionError()
      await flushMicrotasks()
      es.emitConnectionError()
      await flushMicrotasks()
      es.emit('state', makeState())
      es.emitConnectionError()
      await flushMicrotasks()
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))

      const result = await promise
      expect(result.ready).toBe(true)
    })

    it('treats stream-open REST probe rate limits as retryable', async () => {
      mockGet.mockRejectedValueOnce(new ApiError('rate limited', 429))

      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emitConnectionError()
      await flushMicrotasks()
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))

      const result = await promise
      expect(result.ready).toBe(true)
    })

    it('honors Retry-After for stream-open REST probe rate limits', async () => {
      mockGet
        .mockRejectedValueOnce(new ApiError('rate limited', 429, { retry_after: 2 }))
        .mockResolvedValueOnce({
          upload_state: makeState({ ready: true, upload_status: 'complete' }),
        })

      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emitConnectionError()
      await flushMicrotasks()

      expect(mockGet).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1999)
      expect(mockGet).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)

      const result = await promise
      expect(result.ready).toBe(true)
      expect(mockGet).toHaveBeenCalledTimes(2)
    })

    it('rejects immediately when the stream-open REST probe returns a client error', async () => {
      mockGet.mockRejectedValueOnce(new ApiError('Unauthorized', 401))

      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emitConnectionError()

      await expect(promise).rejects.toMatchObject({ name: 'ApiError', status: 401 })
    })

    it('rejects after too many retryable stream-open REST probe errors', async () => {
      const error = new ApiError('temporary outage', 503)
      mockGet.mockRejectedValue(error)

      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 10_000 })
      promise.catch(() => {})
      const es = MockEventSource.instances[0]!
      es.emitConnectionError()
      await flushMicrotasks()
      es.emitConnectionError()
      await flushMicrotasks()
      es.emitConnectionError()

      await expect(promise).rejects.toBe(error)
      expect(mockGet).toHaveBeenCalledTimes(3)
    })

    it('rejects on a server-sent error event that carries data', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      const event = new MessageEvent('error', {
        data: JSON.stringify({ error: 'stream timed out' }),
      })
      es.listeners.get('error')?.forEach(fn => fn(event))
      await expect(promise).rejects.toMatchObject({ name: 'ApiError', message: 'stream timed out' })
    })
  })
})
