import { describe, expect, it, type Mock, vi } from 'vitest'

const workerMock = vi.hoisted(
  () =>
    vi.fn<typeof import('glide-mq').Worker>() as Mock<typeof import('glide-mq').Worker> &
      typeof import('glide-mq').Worker,
)

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: workerMock,
}))

import { KAGI_SMALLWEB_ORDERING } from '@queues/kagi-smallweb/config'
import { kagiSmallWebProcessor } from './workers.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

function makeJob(orderingKey: string, name: string, data: unknown = {}): any {
  return { name, opts: { ordering: { key: orderingKey } }, data }
}

describe('kagiSmallWebProcessor', () => {
  describe('dispatcher ordering key', () => {
    it('routes sync job to dispatchKagiSmallWeb (returns disabled by default)', async () => {
      const result = await kagiSmallWebProcessor(
        makeJob(KAGI_SMALLWEB_ORDERING.dispatcher.key, 'sync'),
      )
      expect(result).toMatchObject({ disabled: true, enqueued: 0 })
    })

    it('throws for unknown dispatcher job name', async () => {
      await expect(
        kagiSmallWebProcessor(makeJob(KAGI_SMALLWEB_ORDERING.dispatcher.key, 'unknown')),
      ).rejects.toThrow('Unknown kagi-smallweb dispatcher job: unknown')
    })
  })

  describe('process ordering key', () => {
    it('routes processFeed job to processFeedEntry and creates topic', async () => {
      const suffix = randomSuffix()
      const hostname = `kagi-worker-${suffix}.example.com`
      const data = {
        feedUrl: `https://${hostname}/feed.xml`,
        name: hostname,
        slug: `kagi-worker-${suffix}-example-com`,
        sourceType: 'web' as const,
      }

      const result = await kagiSmallWebProcessor(
        makeJob(KAGI_SMALLWEB_ORDERING.process.key, 'processFeed', data),
      )
      expect(result).toMatchObject({ created: true })
    })

    it('throws for unknown process job name', async () => {
      await expect(
        kagiSmallWebProcessor(makeJob(KAGI_SMALLWEB_ORDERING.process.key, 'unknown')),
      ).rejects.toThrow('Unknown kagi-smallweb process job: unknown')
    })
  })

  it('throws for unknown ordering key', async () => {
    await expect(kagiSmallWebProcessor(makeJob('unknown-key', 'sync'))).rejects.toThrow(
      'Unknown kagi-smallweb ordering key: unknown-key',
    )
  })
})
