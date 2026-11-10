import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, type Job, type JobOptions, type WorkerOptions } from 'glide-mq'
import { onTestFinished, vi, type MockInstance } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../data-stores/valkey-core/glide-mq-client.mts'
import { closeAndUnregisterGlideMQInstance } from '../data-stores/valkey-glide-mq/index.mts'
import { createAIAgentsWorker } from '../workers/ai-agents/workers/core.mts'
import { AI_AGENTS_QUEUE_NAME } from '../queues/ai-agents/config.mts'
import type { AIAgentJobData } from '../queues/ai-agents/types.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

type ObservedJob = {
  job: Job<AIAgentJobData>
  reportTokens: MockInstance<Job<AIAgentJobData>['reportTokens']>
  moveToDelayed: MockInstance<Job<AIAgentJobData>['moveToDelayed']>
}
export type AIAgentWorkerOutcome = ObservedJob & {
  kind: 'completed' | 'failed' | 'delayed'
  result?: unknown
  error?: Error
}

/** The registered production worker on this file's private native queue namespace. */
export async function startAIAgentWorkerForTest(
  scheduling: Pick<WorkerOptions, 'blockTimeout' | 'promotionInterval'> = {},
) {
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const queue = new Queue<AIAgentJobData>(AI_AGENTS_QUEUE_NAME, connection)
  const events = new QueueEvents(AI_AGENTS_QUEUE_NAME, { ...connection, lastEventId: '0' })
  const worker = createAIAgentsWorker(scheduling)
  const observed = new Map<string, ObservedJob>()
  const waiting = new Map<string, PromiseWithResolvers<AIAgentWorkerOutcome>>()
  worker.on('active', (job: Job<AIAgentJobData>) => {
    observed.set(job.id, {
      job,
      reportTokens: vi.spyOn(job, 'reportTokens'),
      moveToDelayed: vi.spyOn(job, 'moveToDelayed'),
    })
  })
  const settle = (id: string, extra: Pick<AIAgentWorkerOutcome, 'kind' | 'result' | 'error'>) => {
    const active = observed.get(id)
    if (active) waiting.get(id)?.resolve({ ...active, ...extra })
  }
  worker.on('completed', (job: Job, result: unknown) =>
    settle(job.id, { kind: 'completed', result }),
  )
  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (job) settle(job.id, { kind: 'failed', error })
  })
  events.on('delay-changed', ({ jobId }: { jobId: string }) => settle(jobId, { kind: 'delayed' }))
  let closePromise: Promise<void> | undefined
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      const processorSettlement = worker.pause()
      try {
        try {
          await waitForRealGlideEvent(processorSettlement, 'AI agent active processor settlement')
        } finally {
          try {
            try {
              await worker.close(true)
            } finally {
              await closeAndUnregisterGlideMQInstance(worker)
            }
          } finally {
            // A deadline reports a stall; only this original lifecycle promise proves settlement.
            await processorSettlement
          }
        }
      } finally {
        try {
          await events.close()
        } finally {
          try {
            await queue.obliterate({ force: true })
          } finally {
            await queue.close()
            for (const active of observed.values()) {
              active.reportTokens.mockRestore()
              active.moveToDelayed.mockRestore()
            }
          }
        }
      }
    })()
    return closePromise
  }
  onTestFinished(close)
  try {
    await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
  } catch (err) {
    const startupFailure = err
    try {
      await close()
    } catch (cleanupErr) {
      throw new AggregateError(
        [startupFailure, cleanupErr],
        'AI worker startup and cleanup failed',
        {
          cause: cleanupErr,
        },
      )
    }
    throw err
  }
  return {
    worker,
    queue,
    close,
    async run(name: string, data: AIAgentJobData, options: JobOptions = {}) {
      const id = randomUUID()
      const pending = Promise.withResolvers<AIAgentWorkerOutcome>()
      waiting.set(id, pending)
      const [, outcome] = await Promise.all([
        queue.add(name, data, {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
          ...options,
          jobId: id,
        }),
        waitForRealGlideEvent(pending.promise, `AI agent job ${id}`),
      ])
      return outcome
    },
  }
}
