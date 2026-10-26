import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { embeddingCreationLeaseValkeyClient } from '@data-stores/valkey/clients'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'

const LEASE_KEY = 'bedrock-embeddings:creation:lease'
const emptyImageCursor = { sweepStartedAt: '1970-01-01T00:00:00.000Z' }
const imageDefinition = requireBackgroundCpuJob('bedrock-embeddings.create_images')

describe('crashed embedding creation lease holder', () => {
  it('retries the same creation job after a crashed lease holder expires', async () => {
    const fixture = await acquireEmbeddingQuotaFixture()
    const connection = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}-creation-orphan-${randomUUID()}`,
    }
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'orphan',
      connection,
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: BEDROCK_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: BEDROCK_BATCH_MAX_VALUES.max_job_size_gb,
    })
    fixture.beforeRelease(async () => restore())
    let orphanHeld = false
    fixture.beforeRelease(async () => {
      // The child exited without release. Only its unexpired, unreplaced key can remain after
      // the owned worker has drained; never touch a lease after the explicit expiry below.
      if (orphanHeld && (await embeddingCreationLeaseValkeyClient.pttl(LEASE_KEY)) > 0)
        await embeddingCreationLeaseValkeyClient.pexpire(LEASE_KEY, 0)
    })
    try {
      const child = spawn(
        process.execPath,
        [
          new URL('../../../test-helpers/embedding-creation-orphan-child.mts', import.meta.url)
            .pathname,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let output = ''
      let errors = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        errors += chunk.toString()
      })
      const [code] = await once(child, 'close')
      if (code !== 0) throw new Error(`Orphan lease child exited with ${code}: ${errors}`)
      expect(output).toContain('acquired')
      orphanHeld = true
      expect(await embeddingCreationLeaseValkeyClient.pttl(LEASE_KEY)).toBeGreaterThan(0)
      const worker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers: BACKGROUND_CPU_HANDLERS,
          domains: ['bedrock-embeddings'],
          prefix: connection.prefix,
          concurrency: 1,
          blockTimeout: 1_000,
          promotionInterval: 50,
        }),
      )
      await Promise.all([owned.ready(), worker.waitUntilReady()])

      const job = await owned.add(
        imageDefinition.name,
        { cursor: emptyImageCursor },
        {
          ...imageDefinition.options,
          ...creationJobOptions(randomUUID()),
        },
      )
      if (!job) throw new Error('Expected image creation job')
      await owned.waitFor(job.id, 'delay-changed')
      const delayed = await owned.queue.getJob(job.id)
      expect(delayed?.data).toEqual({ cursor: emptyImageCursor })
      expect(delayed?.opts.deduplication).toEqual(job.opts.deduplication)
      expect(await delayed?.getState()).toBe('delayed')
      const expired = await embeddingCreationLeaseValkeyClient.pexpire(LEASE_KEY, 0)
      orphanHeld = false
      expect(expired).toBe(true)
      const completed = waitForRealGlideEvent(
        owned.waitFor(job.id, 'completed'),
        'orphan lease retry completion',
      )
      await owned.promote(job)
      await completed
      expect((await owned.queue.getJob(job.id))?.data).toEqual({ cursor: emptyImageCursor })
    } finally {
      await fixture.close()
    }
  }, 30_000)
})
