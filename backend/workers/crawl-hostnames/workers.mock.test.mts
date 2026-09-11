import { describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => vi.fn<new (...args: unknown[]) => unknown>())

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: workerMock as unknown as typeof import('glide-mq').Worker,
}))

describe('crawl-hostnames worker', () => {
  it('registers the crawl-hostnames processor directly', async () => {
    await import('./workers.mts')
    const { CRAWL_HOSTNAMES_QUEUE_NAME } = await import('@queues/crawl-hostnames/config')
    const { processCrawlHostnamesJob } = await import('./processors.mts')

    expect(workerMock).toHaveBeenCalledWith(
      CRAWL_HOSTNAMES_QUEUE_NAME,
      processCrawlHostnamesJob,
      expect.objectContaining({ concurrency: expect.any(Number) }),
    )
  })
})
