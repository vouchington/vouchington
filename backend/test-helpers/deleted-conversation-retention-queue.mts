import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { createQueue, closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  operationalTombstoneRetentionJobId,
  DATA_RETENTION_JOB_NAME,
  PRIORITY_DEFAULT,
} from '../queues/psql/config.mts'
import { createOperationalTombstoneRetentionHandlers } from '../workers/psql/processors/operational-tombstone-retention.mts'
import type { cleanupOperationalTombstones } from '../services/data-retention/cleanup-operational-tombstones.mts'
import type { OperationalTombstoneFamily } from '../queues/psql/types.mts'
import { createPsqlRetentionDispatcher } from '../workers/psql/processors/retention-dispatch.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

/** The production admission options and processor run in a private native queue namespace. */
export async function openDeletedConversationRetentionQueueForTest(
  cleanupFamily: typeof cleanupOperationalTombstones,
  runDailyCleanup: () => Promise<
    Partial<
      Parameters<ReturnType<typeof createOperationalTombstoneRetentionHandlers>['admitPending']>[0]
    >
  >,
) {
  const name = `deleted_conversation_retention_${randomUUID()}`
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const queue = createQueue(name, { priorityKind: 'ranked' })
  const { admit, admitPending, processRetained } = createOperationalTombstoneRetentionHandlers(
    queue,
    cleanupFamily,
  )
  const dispatch = createPsqlRetentionDispatcher({
    processRetained,
    processDefault: async job => {
      if (job.name !== DATA_RETENTION_JOB_NAME)
        throw new Error('Unexpected fixture maintenance job')
      const result = await runDailyCleanup()
      const idle = { deleted: 0, hasMore: false, continuation: null }
      return {
        undoneActivityPubLikes: idle,
        staleRemoteActors: idle,
        feedHostnameBlocks: idle,
        otherHostnameBlocks: idle,
        deletedConversations: idle,
        appAttestationKeys: idle,
        ...result,
      }
    },
    admitPending,
  })
  const worker = new Worker(name, dispatch, {
    ...connection,
    blockTimeout: 100,
    promotionInterval: 50,
    concurrency: 1,
  })
  const pending = new Map<string, PromiseWithResolvers<'completed' | 'failed'>>()
  const errors: unknown[] = []
  worker.on('error', error => errors.push(error))
  worker.on('completed', job => pending.get(job.id)?.resolve('completed'))
  worker.on('failed', (job: Job | undefined) => {
    if (!job) return
    void job
      .getState()
      .then(state => {
        if (state === 'failed') pending.get(job.id)?.resolve('failed')
      })
      .catch(err => errors.push(err))
  })
  let closePromise: Promise<void> | undefined
  const close = () =>
    (closePromise ??= (async () => {
      try {
        await worker.close()
        if (errors.length) throw new AggregateError(errors, 'Conversation retention worker errors')
        await queue.obliterate({ force: false })
      } finally {
        await closeAndUnregisterGlideMQInstance(queue)
      }
    })())
  try {
    await worker.waitUntilReady()
  } catch (err) {
    await close()
    throw err
  }
  const nextTerminal = (id: string) => {
    const next = Promise.withResolvers<'completed' | 'failed'>()
    pending.set(id, next)
    return waitForRealGlideEvent(next.promise, `retention job ${id}`)
  }
  return {
    queue,
    admit: (families: OperationalTombstoneFamily[] = ['deleted_conversations']) => admit(families),
    runDaily: async () => {
      const id = randomUUID()
      const completed = nextTerminal(id)
      await queue.add(DATA_RETENTION_JOB_NAME, {}, { jobId: id, priority: PRIORITY_DEFAULT })
      return completed
    },
    nextTerminal: (family: OperationalTombstoneFamily = 'deleted_conversations') =>
      nextTerminal(operationalTombstoneRetentionJobId(family)),
    close,
  }
}
