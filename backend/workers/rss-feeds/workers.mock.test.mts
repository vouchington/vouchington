import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => vi.fn<new (...args: unknown[]) => unknown>())

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: workerMock as unknown as typeof import('glide-mq').Worker,
}))

describe('rss-feeds worker', () => {
  it('registers the RSS feeds processor directly', async () => {
    await import('./workers.mts')
    const { QUEUE_NAME } = await import('@queues/rss-feeds/config')
    const { processRssFeedsJob } = await import('./processors.mts')

    expect(workerMock).toHaveBeenCalledWith(
      QUEUE_NAME,
      processRssFeedsJob,
      expect.objectContaining({ concurrency: expect.any(Number) }),
    )
  })
})
