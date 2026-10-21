import { describe, expect, it, vi } from 'vitest'
import {
  createSqsConsumer,
  type SqsConsumerHandler,
  type SqsConsumerPort,
} from './sqs-consumer.mts'

describe('createSqsConsumer', () => {
  it('emits poll-error and keeps polling when receive rejects for a reason other than abort', async () => {
    vi.useFakeTimers()
    const receiveError = new Error('network blip')
    let receiveCallCount = 0
    const port: SqsConsumerPort = {
      receive: signal =>
        new Promise((_resolve, reject) => {
          receiveCallCount += 1
          if (receiveCallCount === 1) {
            reject(receiveError)
            return
          }
          // A later receive stands in for the next real long poll.
          signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
        }),
      delete: () => Promise.resolve(),
    }
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    const pollError = new Promise<unknown>(resolve => consumer.once('poll-error', resolve))

    try {
      const error = await pollError
      expect(error).toBe(receiveError)
      expect(receiveCallCount).toBe(1)

      await vi.advanceTimersByTimeAsync(4_999)
      expect(receiveCallCount).toBe(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(receiveCallCount).toBe(2)
      await consumer.close()

      expect(handleMessage).not.toHaveBeenCalled()
    } finally {
      try {
        const closing = consumer.close()
        await vi.runOnlyPendingTimersAsync()
        await closing
      } finally {
        vi.useRealTimers()
      }
    }
  })

  it('close interrupts poll-error backoff without reporting an abort as another poll error', async () => {
    vi.useFakeTimers()
    const receiveError = new Error('network blip')
    let receiveCallCount = 0
    const port: SqsConsumerPort = {
      receive: () => {
        receiveCallCount += 1
        return Promise.reject(receiveError)
      },
      delete: () => Promise.resolve(),
    }
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())
    const consumer = createSqsConsumer({ name: 'test', queueUrl: 'unused', handleMessage, port })
    const pollErrors: unknown[] = []
    consumer.on('poll-error', error => pollErrors.push(error))

    let closing: Promise<void> | undefined
    try {
      await new Promise<void>(resolve => consumer.once('poll-error', () => resolve()))
      closing = consumer.close()
      let closed = false
      void closing.then(
        () => {
          closed = true
        },
        () => {},
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(closed).toBe(true)
      await closing

      expect(receiveCallCount).toBe(1)
      expect(pollErrors).toEqual([receiveError])
      expect(handleMessage).not.toHaveBeenCalled()
    } finally {
      try {
        closing ??= consumer.close()
        await vi.runOnlyPendingTimersAsync()
        await closing
      } finally {
        vi.useRealTimers()
      }
    }
  })
})
