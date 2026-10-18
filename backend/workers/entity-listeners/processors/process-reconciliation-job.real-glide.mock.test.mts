import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB,
  ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB,
} from '@queues/background/enqueues/entity-listeners-jobs'
import { scheduledJobManifest } from '@queues/entity-listeners/enqueues/schedules'
import { entityReconciliationRootOptions } from '@queues/entity-listeners/enqueues/reconciliation'
import type {
  EntityReconciliationDispatchData,
  ReconcileEntityData,
} from '@queues/entity-listeners/types'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
// A relative import: @workers/background depends on this package, so a package dependency would cycle.
import { createBackgroundProcessor } from '../../background/processors.mts'
import { reconcileEntityBatches } from './reconciliation.mts'
import { processReconciliationJob } from './process-reconciliation-job.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('reconciliation sweep ownership', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

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
    const seen: { id: string; data: unknown }[] = []
    let roots = 0
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: 5,
      bodies: {
        // The production root handler enqueues on the shared queue; this isolated queue needs the
        // same job and options on its own queue.
        [ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB.name]: async () => {
          const added = await harness!.queue.add(
            ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name,
            {},
            {
              ...ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.options,
              ...entityReconciliationRootOptions(),
              ordering: undefined,
            },
          )
          if (++roots >= 2) repeated.resolve()
          return added?.id ?? null
        },
        [ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name]: (job: Job) => {
          seen.push({ id: job.id, data: job.data })
          return processReconciliationJob(job, async (data, save) => {
            const window = data.window ?? fixedWindow
            await save({ window, ...(data.after && { after: data.after }) })
            return reconcileEntityBatches(
              oneBatch(data.after ? second : first),
              {
                reconcileEntity: async () => {
                  if (!data.after) {
                    started.resolve()
                    await release.promise
                  }
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
      },
    })
    const queue = harness.queue
    // This test is about root coalescing, so the jobs run outside the domain group: GlideMQ can park
    // a group job whose ordering sequence a parallel claim reaches first until another job completes.
    const template = scheduledJobManifest.jobs[0]!
    const fastSchedule = defineScheduledJobManifest(queue.name, [
      {
        ...template,
        template: {
          name: ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB.name,
          data: {},
          opts: toSchedulerTemplateOptions({
            ...ENTITY_LISTENERS_ENQUEUE_RECONCILE_ENTITIES_JOB.options,
            ordering: undefined,
          }),
        },
        repeat: () => ({ every: 1000 }),
        subMinuteJustification: 'Synthetic scheduler repeat regression within the test timeout.',
      },
    ])
    try {
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
      await upsertScheduledJobManifest(queue, defineScheduledJobManifest(queue.name, []))
      release.resolve()
      await harness.settled(active!)
      expect(seen.map(item => item.id)).toEqual([active!.id, active!.id])
      expect(seen[1]!.data).toEqual({ window: fixedWindow, after: first })
      expect((await queue.getJob(active!.id))?.attemptsMade).toBe(0)
    } finally {
      release.resolve()
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
          {
            reconcileEntity: async candidate => {
              if (candidate.entityId === 'b') throw failure
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
