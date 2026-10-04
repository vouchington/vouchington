import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { QUEUE_NAME } from '@queues/entity-listeners/config'
import { entitiesListeners as queue } from '@queues/entity-listeners/queues'
import { scheduledJobManifest } from '@queues/entity-listeners/enqueues/schedules'
import { enqueueReconcileEntities } from '@queues/entity-listeners/enqueues/reconciliation'
import type {
  EntityReconciliationDispatchData,
  ReconcileEntityData,
} from '@queues/entity-listeners/types'
import { reconcileEntityBatches } from './reconciliation.mts'
import { processReconciliationJob } from './process-reconciliation-job.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('reconciliation sweep ownership', () => {
  it('coalesces repeated scheduler roots while one job advances bounded passes', async () => {
    const fixedWindow = {
      start: '2026-07-17T00:00:00.000Z',
      end: '2026-07-17T00:01:00.000Z',
    }
    const first: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'a',
      changedAtEpochUs: '1',
    }
    const second: ReconcileEntityData = {
      ...first,
      entityId: 'b',
      changedAtEpochUs: '2',
    }
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const repeated = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    const seen: { id: string; data: unknown }[] = []
    let roots = 0
    let checkpointAdvances = 0
    const worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'enqueueReconcileEntities') {
          const result = await enqueueReconcileEntities()
          if (++roots >= 2) repeated.resolve()
          return result
        }
        seen.push({ id: job.id, data: job.data })
        return processReconciliationJob(job, async (data, save) => {
          const window = data.window ?? fixedWindow
          await save({ window, ...(data.after && { after: data.after }) })
          return reconcileEntityBatches(
            oneBatch(data.after ? second : first),
            new Date(window.end),
            {
              reconcileEntity: async () => {
                if (!data.after) {
                  started.resolve()
                  await release.promise
                }
              },
              advanceCheckpoint: async () => {
                checkpointAdvances++
              },
            },
            {
              initialAfter: data.after,
              hasMore: () => !data.after,
              onMore: after => save({ window, ...(after && { after }) }),
            },
          )
        })
      },
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 5,
        blockTimeout: 1000,
      },
    )
    worker.on('completed', job => {
      if (job.name === 'reconcileEntities') completed.resolve()
    })
    const template = scheduledJobManifest.jobs[0]!
    const fastSchedule = defineScheduledJobManifest(QUEUE_NAME, [
      {
        ...template,
        repeat: () => ({ every: 1000 }),
        subMinuteJustification: 'Synthetic scheduler repeat regression within the test timeout.',
      },
    ])
    try {
      await worker.waitUntilReady()
      await upsertScheduledJobManifest(queue, fastSchedule)
      await started.promise
      await repeated.promise
      expect(seen).toHaveLength(1)
      const active = await queue.getJob(seen[0]!.id)
      expect(active?.data).toEqual({ window: fixedWindow })
      expect(active?.opts.deduplication).toEqual({
        id: 'entity-reconciliation-dispatcher',
        mode: 'simple',
      })
      await upsertScheduledJobManifest(queue, defineScheduledJobManifest(QUEUE_NAME, []))
      release.resolve()
      await completed.promise
      expect(seen.map(item => item.id)).toEqual([active!.id, active!.id])
      expect(seen[1]!.data).toEqual({ window: fixedWindow, after: first })
      expect(checkpointAdvances).toBe(1)
      expect((await queue.getJob(active!.id))?.attemptsMade).toBe(0)
      expect(await enqueueReconcileEntities()).toBeDefined()
    } finally {
      release.resolve()
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('saves successful progress without masking the original side-effect failure', async () => {
    const window = {
      start: '2026-07-17T00:00:00.000Z',
      end: '2026-07-17T00:01:00.000Z',
    }
    const first: ReconcileEntityData = {
      entityType: 'user',
      entityId: 'a',
      changedAtEpochUs: '1',
    }
    const failure = new Error('side effect failed')
    const updateData = vi.fn<(data: EntityReconciliationDispatchData) => Promise<void>>(
      async () => {},
    )
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>(async () => {
      throw new Error('unexpected delay')
    })
    await expect(
      processReconciliationJob({ data: {}, updateData, moveToDelayed }, async (_, save) => {
        await save({ window })
        return reconcileEntityBatches(
          twoBatches(first),
          new Date(window.end),
          {
            reconcileEntity: async candidate => {
              if (candidate.entityId === 'b') throw failure
            },
            advanceCheckpoint: async () => {
              throw new Error('unexpected checkpoint')
            },
          },
          {
            hasMore: () => false,
            onMore: after => save({ window, after }),
          },
        )
      }),
    ).rejects.toBe(failure)
    expect(updateData.mock.calls).toEqual([[{ window }], [{ window, after: first }]])
    expect(moveToDelayed).not.toHaveBeenCalled()
  })
})

async function* oneBatch(candidate: ReconcileEntityData) {
  yield [candidate]
}
async function* twoBatches(first: ReconcileEntityData) {
  yield [first, { ...first, entityId: 'b' }]
}
