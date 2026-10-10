import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => vi.fn<new (...args: unknown[]) => unknown>())

// The data-store factory is preloaded by the test setup, so reset modules to rebuild it on the mock.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => ({
  ...(await importOriginal()),
  Worker: workerMock as unknown as typeof import('glide-mq').Worker,
}))

describe('rss-feeds worker', () => {
  it('registers the RSS feeds processor directly', async () => {
    vi.resetModules()
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
