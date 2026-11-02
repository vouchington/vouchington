import { randomBytes, randomUUID } from 'node:crypto'
import {
  enqueueHostnameBlockRecovery,
  enqueueOrReactivateHostnameBlockCleanups,
} from '@queues/background/enqueues/hostname-blocking'
import type { HostnameBlockCleanupData } from '@queues/background/enqueues/hostname-blocking-jobs'
import { background } from '@queues/background/queues'
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
import { describe, expect, it } from 'vitest'
import { createBackgroundProcessor } from '../processors.mts'
import { buildHandlerMap } from './handler-map.mts'
import { hostnameBlockingHandlers } from './hostname-blocking.mts'

describe('hostname block cleanup background handlers', () => {
  it('enqueues the scheduler root without running recovery', async () => {
    const enqueued = await enqueueHostnameBlockRecovery()
    await expect(readEnqueuedJob(background, enqueued)).resolves.toMatchObject({
      name: 'hostname-blocking.recoverBlocks',
      data: {},
      opts: { ordering: { key: 'hostname-blocking:dispatcher', concurrency: 1 } },
    })
  })

  it('completes every bounded cleanup stage through the production queue', async () => {
    const restore = overrideDynamicConfigFieldsForTest(hostnameBlockingWorkConfig, {
      relation_delete_batch_size: 1,
      hostname_scan_batch_size: 1,
      url_scan_batch_size: 1,
      penalty_enqueue_batch_size: 1,
    })
    try {
      const [administrator, creator] = await Promise.all([
        createTestUserDirect({ administrator: true }),
        createTestUserDirect(),
      ])
      const hostname = `worker-${randomBytes(6).toString('hex')}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname })
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
      const operation = await createOperation(hostnameId, hostname, administrator.id)
      const process = createBackgroundProcessor(
        buildHandlerMap(hostnameBlockingHandlers, ['hostname-blocking']),
      )

      const stages: string[] = []
      const ids = new Set<string>()
      await enqueueOrReactivateHostnameBlockCleanups([
        { blockId: operation.blockId, progress: operation.progress },
      ])
      let progress = operation.progress
      for (;;) {
        const id = `hostnameBlock__${operation.blockId}__${progress}`
        const job = await background.getJob(id)
        if (!job) throw new Error(`Missing cleanup job ${id}`)
        ids.add(job.id)
        stages.push((job.data as HostnameBlockCleanupData).cursor?.stage ?? 'subdomains')
        await process(job)
        const current = await getHostnameBlockCleanupOperation(operation.blockId)
        if (current?.completedAt) break
        if (!current || current.progress === progress) throw new Error('Cleanup did not advance')
        progress = current.progress
      }

      await expect(getHostnameBlockCleanupOperation(operation.blockId)).resolves.toMatchObject({
        completedAt: expect.any(Date),
        blockedHostnameCount: 1,
        softDeletedRelationCount: 1,
        penalizedUserCount: 1,
      })
      await expect(getTestRelationDeletedAt(postId, urlId)).resolves.toBeInstanceOf(Date)
      expect(stages).toEqual(expect.arrayContaining(['subdomains', 'relations', 'penalties']))
      expect(ids.size).toBe(stages.length)
    } finally {
      restore()
    }
  })

  it('completes a cleanup job for an unknown block without enqueueing more work', async () => {
    const blockId = randomUUID()
    const process = createBackgroundProcessor(
      buildHandlerMap(hostnameBlockingHandlers, ['hostname-blocking']),
    )
    await enqueueOrReactivateHostnameBlockCleanups([{ blockId, progress: 0 }])
    const job = await background.getJob(`hostnameBlock__${blockId}__0`)
    if (!job) throw new Error('Missing unknown-block cleanup job')

    await expect(process(job)).resolves.toBeUndefined()
    await expect(background.getJob(`hostnameBlock__${blockId}__1`)).resolves.toBeFalsy()
  })
})

async function createOperation(hostnameId: string, hostname: string, administratorId: string) {
  await using query = await beginTransaction()
  const operation = await ensureHostnameBlockCleanupOperation(
    query,
    hostnameId,
    hostname,
    administratorId,
    'admin',
    true,
  )
  await query.commit()
  return operation
}
