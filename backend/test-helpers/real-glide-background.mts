import type { Job, WorkerOptions } from 'glide-mq'
import type { BackgroundHandler, BackgroundJobDefinition } from '@queues/background/types'
import { BACKGROUND_JOBS } from '@queues/background/enqueues/registry'
import {
  startRealGlideBackgroundLifecycle,
  type RealGlideBackgroundHarness,
  type RealGlideConnection,
  type RealGlideProcessor,
} from './real-glide-background-lifecycle.mts'

type JobBody = (job: Job) => unknown

export type BackgroundHarness = RealGlideBackgroundHarness<BackgroundJobDefinition>

export type BackgroundHarnessOptions = {
  connection: RealGlideConnection
  createProcessor: (handlers: ReadonlyMap<string, BackgroundHandler>) => RealGlideProcessor
  bodies?: Record<string, JobBody>
  /**
   * Run on the production `background` queue instead of a unique one. Only for a test that gives
   * itself a private Valkey namespace first, so production enqueues reach this harness's workers.
   */
  queueName?: string
  workers?: number
  concurrency?: number
  workerOptions?: Partial<WorkerOptions>
}

/**
 * Real GlideMQ, real PostgreSQL pause state, and the production processor over an isolated queue.
 * The caller passes `createProcessor` (the worker package's production factory, which this shared
 * helper cannot import). Domain business handlers are replaced by `bodies`, keyed by registry job
 * name; every other registered job completes at once. The queue name is unique, so no worker fleet
 * can consume it.
 */
export function startBackgroundHarness(
  options: BackgroundHarnessOptions,
): Promise<BackgroundHarness> {
  const handlers = new Map<string, BackgroundHandler>(
    BACKGROUND_JOBS.map(job => [
      job.name,
      { job, handle: options.bodies?.[job.name] ?? (() => undefined) },
    ]),
  )
  return startRealGlideBackgroundLifecycle<BackgroundJobDefinition>({
    queueNamePrefix: 'background_harness',
    queueName: options.queueName,
    connection: options.connection,
    processor: options.createProcessor(handlers),
    workers: options.workers,
    concurrency: options.concurrency,
    workerOptions: options.workerOptions,
  })
}
