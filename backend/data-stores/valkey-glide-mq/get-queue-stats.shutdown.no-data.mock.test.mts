import { describe, expect, it, vi } from 'vitest'
import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { getQueueStats } from './get-queue-stats.mts'

const closeQueue = vi.hoisted(() => vi.fn<() => Promise<void>>())

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => {
  const original = await importOriginal()
  return {
    ...original,
    Queue: class extends original.Queue {
      override close(): Promise<void> {
        return closeQueue()
      }
    },
  }
})

describe('queue stats shutdown', () => {
  it('reports a queue close failure with its queue name and finishes shutdown', async () => {
    const queueName = `stats-shutdown-${crypto.randomUUID()}`
    await getQueueStats(queueName)
    const failure = new Error('queue close failed') as Error & {
      extra?: Record<string, unknown>
    }
    closeQueue.mockRejectedValueOnce(failure)
    await expect(
      onGracefulShutdown('SIGTERM', {
        onGracefulShutdownValkey: async () => {},
        onGracefulShutdownPSQL: async () => {},
      }),
    ).resolves.toBeUndefined()

    expect(closeQueue).toHaveBeenCalledOnce()
    expect(failure.extra).toEqual({ operation: 'closeQueueInstance', queueName })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ extra: expect.objectContaining(failure.extra) }),
    )
  })
})
