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
import { ImageBlockedError, ImageProcessingTimeoutError, pollImageUntilTerminal } from '../images'
import { ApiError } from '../../error'
import { makeState, MockEventSource } from '../test-helpers/images'

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
    it('resolves when the first state event is ready', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))
      const result = await promise
      expect(result.ready).toBe(true)
    })

    it('waits through non-terminal states then resolves on ready', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emit('state', makeState())
      es.emit('state', makeState())
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))
      const result = await promise
      expect(result.ready).toBe(true)
    })

    it('keeps the EventSource open past a server cycle without an explicit client deadline', async () => {
      const promise = pollImageUntilTerminal('img-1')
      promise.catch(() => {})
      const es = MockEventSource.instances[0]!

      await vi.advanceTimersByTimeAsync(60_001)

      expect(es.closed).toBe(false)
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))
      await expect(promise).resolves.toMatchObject({ ready: true })
    })

    it('throws ImageBlockedError when the state is blocked', async () => {
      const promise = pollImageUntilTerminal('img-2', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emit('state', makeState({ id: 'img-2', blocked: true, upload_status: 'complete' }))
      await expect(promise).rejects.toBeInstanceOf(ImageBlockedError)
    })

    it('throws ApiError when status reaches failed', async () => {
      const promise = pollImageUntilTerminal('img-3', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emit(
        'state',
        makeState({ id: 'img-3', upload_status: 'failed', upload_error: 'corrupt png' }),
      )
      await expect(promise).rejects.toMatchObject({
        name: 'ApiError',
        message: 'corrupt png',
      })
    })

    it('throws ImageProcessingTimeoutError when the deadline passes', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 1000 })
      promise.catch(() => {})
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toBeInstanceOf(ImageProcessingTimeoutError)
    })

    it('throws ImageProcessingTimeoutError when timeoutMs is 0', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 0 })
      promise.catch(() => {})
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toBeInstanceOf(ImageProcessingTimeoutError)
    })

    it('throws AbortError when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(
        pollImageUntilTerminal('img-1', { timeoutMs: 5000, signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('throws AbortError when the signal is aborted while streaming', async () => {
      const controller = new AbortController()
      const promise = pollImageUntilTerminal('img-1', {
        timeoutMs: 5000,
        signal: controller.signal,
      })
      const es = MockEventSource.instances[0]!
      es.emit('state', makeState())
      controller.abort()
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('closes the EventSource when the image becomes ready', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 5000 })
      const es = MockEventSource.instances[0]!
      es.emit('state', makeState({ ready: true, upload_status: 'complete' }))
      await promise
      expect(es.closed).toBe(true)
    })

    it('closes the EventSource on timeout', async () => {
      const promise = pollImageUntilTerminal('img-1', { timeoutMs: 500 })
      promise.catch(() => {})
      await vi.runAllTimersAsync()
      await promise.catch(() => {})
      const es = MockEventSource.instances[0]!
      expect(es.closed).toBe(true)
    })
  })
})
