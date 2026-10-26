import {
  closeAndUnregisterGlideMQInstance,
  createQueue,
  createWorker,
} from '@data-stores/valkey-glide-mq'
import { randomBytes, randomUUID } from 'node:crypto'
import { getBackgroundOrderingConcurrency } from '@queues/background/config'
import { createHostnameBlockingEnqueues } from '@queues/background/enqueues/hostname-blocking'
import {
  HOSTNAME_BLOCKING_PROCESS_JOB,
  HOSTNAME_BLOCKING_RECOVERY_JOB,
} from '@queues/background/enqueues/hostname-blocking-jobs'
import {
  ensureHostnameBlockCleanupOperation,
  getHostnameBlockCleanupOperation,
} from '@services/hostname-blocking/cleanup-operation'
import { hostnameBlockingWorkConfig } from '@services/hostname-blocking/work-limits'
import {
  beginTransaction,
  createTestUserDirect,
  getTestRelationDeletedAt,
  insertTestPost,
  insertTestPostRelatedUrlBatch,
  insertTestUrlHostname,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import type { Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { createBackgroundProcessor } from '../processors.mts'
import { buildHandlerMap } from './handler-map.mts'
import { createHostnameBlockingHandlers } from './hostname-blocking-handler-factory.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('hostname block cleanup background handlers', () => {
  it('enqueues the scheduler root on an owned queue without running recovery', async () => {
    const queue = createQueue(`hostname-blocking-root-${randomUUID()}`, {
      priorityKind: 'ranked',
      orderingConcurrency: getBackgroundOrderingConcurrency,
    })
    try {
      const enqueued = await createHostnameBlockingEnqueues(queue).enqueueRecovery()
      await expect(readEnqueuedJob(queue, enqueued)).resolves.toMatchObject({
        name: HOSTNAME_BLOCKING_RECOVERY_JOB.name,
        data: {},
        opts: { ordering: { key: 'hostname-blocking:dispatcher', concurrency: 1 } },
      })
    } finally {
      await queue.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(queue)
    }
  })

  it('recovers and completes every bounded stage through an owned real queue', async ({
    signal,
  }) => {
    const restore = overrideDynamicConfigFieldsForTest(hostnameBlockingWorkConfig, {
      relation_delete_batch_size: 1,
      hostname_scan_batch_size: 1,
      url_scan_batch_size: 1,
      penalty_enqueue_batch_size: 1,
      recovery_batch_size: 1,
    })
    const [administrator, creator] = await Promise.all([
      createTestUserDirect({ administrator: true }),
      createTestUserDirect(),
    ])
    const hostname = `worker-${randomBytes(6).toString('hex')}.example.com`
    const [cursorHostnameId, hostnameId] = await Promise.all([
      insertTestUrlHostname({ hostname: `cursor-${randomBytes(6).toString('hex')}.example.com` }),
      insertTestUrlHostname({ hostname }),
    ])
    const postId = await insertTestPost({
      title: `Hostname worker ${randomUUID()}`,
      slug: `hostname-worker-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const urlId = createTestUuidWindow().firstId
    await insertTestPostRelatedUrlBatch({
      postIds: [postId],
      urlIds: [urlId],
      hostname,
      hostnameId,
      createdById: creator.id,
    })
    const afterBlockId = (await createOperation(cursorHostnameId, administrator.id)).blockId
    const operation = await createOperation(hostnameId, administrator.id)
    expect(operation.blockId.localeCompare(afterBlockId)).toBeGreaterThan(0)

    const queue = createQueue(`hostname-blocking-${randomUUID()}`, {
      priorityKind: 'ranked',
      orderingConcurrency: getBackgroundOrderingConcurrency,
    })
    const enqueues = createHostnameBlockingEnqueues(queue)
    const worker = createWorker(
      queue.name,
      createBackgroundProcessor(
        buildHandlerMap(createHostnameBlockingHandlers(enqueues), ['hostname-blocking']),
      ),
      {
        concurrency: 1,
        blockTimeout: 100,
        promotionInterval: 100,
        dedicatedCommandClient: true,
      },
    )
    const completed = Promise.withResolvers<void>()
    const recoveryCompleted = Promise.withResolvers<void>()
    const unknownCompleted = Promise.withResolvers<void>()
    const jobs: Job[] = []
    const unknownBlockId = randomUUID()
    const rejectOnAbort = () => {
      const error = signal.reason ?? new Error('Hostname blocking worker test aborted')
      completed.reject(error)
      recoveryCompleted.reject(error)
      unknownCompleted.reject(error)
    }
    signal.addEventListener('abort', rejectOnAbort, { once: true })
    void completed.promise.catch(() => {})
    void recoveryCompleted.promise.catch(() => {})
    void unknownCompleted.promise.catch(() => {})
    worker.on('completed', job => {
      jobs.push(job)
      if (
        job.name === HOSTNAME_BLOCKING_PROCESS_JOB.name &&
        job.data.blockId === operation.blockId &&
        job.data.cursor?.stage === 'penalties' &&
        job.data.cursor.afterUserId === creator.id
      ) {
        completed.resolve()
      }
      if (
        job.name === HOSTNAME_BLOCKING_RECOVERY_JOB.name &&
        job.data.afterBlockId === operation.blockId
      ) {
        recoveryCompleted.resolve()
      }
      if (job.name === HOSTNAME_BLOCKING_PROCESS_JOB.name && job.data.blockId === unknownBlockId) {
        unknownCompleted.resolve()
      }
    })
    worker.on('failed', (_job, error) => {
      completed.reject(error)
      recoveryCompleted.reject(error)
      unknownCompleted.reject(error)
    })
    worker.on('error', error => {
      completed.reject(error)
      recoveryCompleted.reject(error)
      unknownCompleted.reject(error)
    })

    try {
      await worker.waitUntilReady()
      await enqueues.enqueueRecovery({ afterBlockId })
      await Promise.all([completed.promise, recoveryCompleted.promise])

      await enqueues.enqueueCleanups([{ blockId: unknownBlockId, progress: 0 }])
      await unknownCompleted.promise

      await expect(getHostnameBlockCleanupOperation(operation.blockId)).resolves.toMatchObject({
        completedAt: expect.any(Date),
        blockedHostnameCount: 1,
        softDeletedRelationCount: 1,
        penalizedUserCount: 1,
      })
      await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeInstanceOf(Date)
      const operationStages = jobs
        .filter(job => job.data.blockId === operation.blockId)
        .map(job => job.data.cursor?.stage ?? 'subdomains')
      expect(operationStages).toEqual(
        expect.arrayContaining(['subdomains', 'relations', 'penalties']),
      )
      expect(new Set(jobs.map(job => job.id)).size).toBe(jobs.length)
    } finally {
      signal.removeEventListener('abort', rejectOnAbort)
      restore()
      await closeAndUnregisterGlideMQInstance(worker)
      await queue.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(queue)
    }
  })
})

async function createOperation(hostnameId: string, administratorId: string) {
  await using query = await beginTransaction()
  const operation = await ensureHostnameBlockCleanupOperation(
    query,
    hostnameId,
    administratorId,
    'admin',
    true,
  )
  await query.commit()
  return operation
}
