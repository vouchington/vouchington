import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { ENQUEUE_BASE_DEFAULTS } from '../data-stores/valkey-glide-mq/index.mts'
import { enqueueBulkReactivatingFinished } from '../data-stores/valkey-glide-mq/enqueue-or-reactivate.mts'
import {
  getTerminalActivityRetentionJobOptions,
  terminalActivityRetentionJobId,
} from '../queues/psql/enqueues/activitypub-terminal-retention.mts'
import { TERMINAL_ACTIVITY_RETENTION_JOB_NAME } from '../queues/psql/config.mts'
import type { TerminalActivityRetentionData } from '../queues/psql/types.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

/** Replay the family producer's current options in a private real namespace, never shared PSQL IDs. */
export async function openTerminalRetentionQueueForTest(
  processor: (job: Job<TerminalActivityRetentionData>) => Promise<unknown>,
  registerCleanup?: (close: () => Promise<void>) => void,
) {
  const name = `terminal_retention_${randomUUID()}`
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const queue = new Queue<TerminalActivityRetentionData>(name, connection)
  const worker = new Worker<TerminalActivityRetentionData>(name, processor, {
    ...connection,
    blockTimeout: 100,
    promotionInterval: 50,
    concurrency: 2,
  })
  const errors: unknown[] = []
  const pending = new Map<string, PromiseWithResolvers<'completed' | 'failed'>>()
  worker.on('error', error => errors.push(error))
  worker.on('completed', job => pending.get(job.id)?.resolve('completed'))
  worker.on('failed', (job: Job<TerminalActivityRetentionData> | undefined) => {
    if (!job) return
    void job
      .getState()
      .then(state => {
        // Native worker 'failed' fires for retryable attempts too; only terminal state settles.
        if (state === 'failed') pending.get(job.id)?.resolve('failed')
      })
      .catch(err => errors.push(err))
  })
  let closePromise: Promise<void> | undefined
  const close = () =>
    (closePromise ??= (async () => {
      try {
        await worker.close()
        if (errors.length) throw new AggregateError(errors, 'Terminal retention worker errors')
        await queue.obliterate({ force: false })
      } finally {
        await queue.close()
      }
    })())
  // Register ownership before readiness can reject, so partial startup cannot leak a worker.
  registerCleanup?.(close)
  try {
    await worker.waitUntilReady()
  } catch (err) {
    await close()
    throw err
  }
  const enqueueBulk = (inputs: TerminalActivityRetentionData[]) =>
    queue.addBulk(
      inputs.map(data => ({
        name: TERMINAL_ACTIVITY_RETENTION_JOB_NAME,
        data,
        opts: { ...ENQUEUE_BASE_DEFAULTS, ...getTerminalActivityRetentionJobOptions(data) },
      })),
    )
  return {
    queue,
    admit: (families: TerminalActivityRetentionData['family'][]) =>
      enqueueBulkReactivatingFinished({
        queue,
        inputs: families.map(family => ({ family })),
        jobIdOf: terminalActivityRetentionJobId,
        enqueueBulk,
      }),
    nextTerminal: (family: TerminalActivityRetentionData['family']) => {
      const id = terminalActivityRetentionJobId({ family })
      const next = Promise.withResolvers<'completed' | 'failed'>()
      pending.set(id, next)
      return waitForRealGlideEvent(next.promise, `terminal retention ${family}`)
    },
    close,
  }
}
