import type { Job, WorkerOptions } from 'glide-mq'
import type { BackgroundCpuJobDefinition } from '@queues/background-cpu/types'
import {
  startRealGlideBackgroundLifecycle,
  type RealGlideBackgroundHarness,
  type RealGlideConnection,
} from './real-glide-background-lifecycle.mts'

type JobBody = (job: Job) => unknown

export type BackgroundCpuHarness = RealGlideBackgroundHarness<BackgroundCpuJobDefinition>

export type BackgroundCpuHarnessOptions = {
  connection: RealGlideConnection
  /** Probe bodies for queue ordering tests; production handler routing is tested separately. */
  bodies: Record<string, JobBody>
  workers?: number
  concurrency?: number
  workerOptions?: Partial<WorkerOptions>
}

/**
 * Real GlideMQ on an isolated queue for scheduling, grouping, and lock semantics. Business bodies
 * are probes; this helper deliberately does not replace the production handler map.
 */
export function startBackgroundCpuHarness(
  options: BackgroundCpuHarnessOptions,
): Promise<BackgroundCpuHarness> {
  const processor = async (job: Job): Promise<unknown> => {
    const body = options.bodies[job.name]
    if (!body) throw new Error(`No queue-test probe for ${job.name}`)
    return body(job)
  }
  return startRealGlideBackgroundLifecycle<BackgroundCpuJobDefinition>({
    queueNamePrefix: 'background_cpu_harness',
    connection: options.connection,
    processor,
    workers: options.workers,
    concurrency: options.concurrency,
    workerOptions: options.workerOptions,
  })
}
