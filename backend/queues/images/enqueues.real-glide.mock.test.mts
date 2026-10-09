import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  ENQUEUE_BASE_DEFAULTS,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'
import { startRealGlideJobLifecycle } from '@voucha/test-helpers/real-glide-job-lifecycle'
import { getExtractImageMetadataJobOptions } from './enqueues.mts'
import { imagesQueue } from './queues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

// The hourly cleanup-abandoned-uploads recovery re-enqueues every image still stuck in processing,
// so a re-enqueue must start a new extraction once the previous job is done however it ended.
describe('extract-metadata enqueue through real GlideMQ', () => {
  afterAll(() => imagesQueue.close())

  // Priority only orders pickup; zero skips the scheduler's ~5s promotion of prioritized jobs.
  const productionOptions = (imageId: string) => ({
    ...ENQUEUE_BASE_DEFAULTS,
    ...getExtractImageMetadataJobOptions(imageId),
    attempts: 1,
    priority: 0,
  })

  it.each(['complete', 'fail'] as const)(
    'accepts a new extraction after the previous one %s with its record retained',
    async outcome => {
      const lifecycle = await startRealGlideJobLifecycle<{ id: string }>(
        'images_extract_replay',
        connection,
      )
      const imageId = randomUUID()
      try {
        lifecycle.setOutcome(outcome)
        const first = await lifecycle.queue.add(
          'extract-metadata',
          { id: imageId },
          productionOptions(imageId),
        )
        if (!first) throw new Error('Expected the first extraction to be created')
        await expect(lifecycle.settled(first)).resolves.toBe(
          outcome === 'complete' ? 'completed' : 'failed',
        )
        await expect(lifecycle.queue.getJob(first.id)).resolves.not.toBeNull()

        lifecycle.setOutcome('complete')
        const second = await lifecycle.queue.add(
          'extract-metadata',
          { id: imageId },
          productionOptions(imageId),
        )
        expect(second).not.toBeNull()
        expect(second?.id).not.toBe(first.id)
        await expect(lifecycle.settled(second!)).resolves.toBe('completed')
      } finally {
        await lifecycle.close()
      }
    },
  )

  it('still collapses a second request while the first extraction is in flight', async () => {
    const lifecycle = await startRealGlideJobLifecycle<{ id: string }>(
      'images_extract_in_flight',
      connection,
    )
    const imageId = randomUUID()
    try {
      // Delay keeps the first job pending so the worker cannot settle it before the duplicate add.
      const first = await lifecycle.queue.add(
        'extract-metadata',
        { id: imageId },
        { ...productionOptions(imageId), delay: 60_000 },
      )
      expect(first).not.toBeNull()
      await expect(
        lifecycle.queue.add('extract-metadata', { id: imageId }, productionOptions(imageId)),
      ).resolves.toBeNull()
    } finally {
      await lifecycle.close()
    }
  })
})
