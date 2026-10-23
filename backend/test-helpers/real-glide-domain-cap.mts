import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import type { BackgroundHandler, BackgroundJobDefinition } from '@queues/background/types'
import { startBackgroundHarness, type BackgroundHarnessOptions } from './real-glide-background.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

const SPARE_SLOTS = 3

/**
 * Fills one capped domain on a real shared queue whose workers have more slots than the cap, then
 * queues more of its jobs and a job of another domain, and reports the most jobs of the capped
 * domain that ran at once. The fill adds one job at a time and waits for each to start, because
 * GlideMQ parks a group job whose ordering sequence a parallel claim reaches first. Each wait
 * resolves on that worker event and rejects with a named deadline when the event never arrives.
 *
 * @param options.jobs - the capped domain's jobs; they take turns across the flood
 * @param options.cap - the group concurrency the domain is expected to hold
 * @param options.connection - the worker queue connection and prefix
 * @param options.createProcessor - the worker package's production processor factory
 * @returns the highest number of capped-domain jobs that were running together
 */
export async function measureDomainCap(options: {
  jobs: readonly BackgroundJobDefinition[]
  cap: number
  connection: BackgroundHarnessOptions['connection']
  createProcessor: (
    handlers: ReadonlyMap<string, BackgroundHandler>,
  ) => (job: Job) => Promise<unknown>
}): Promise<number> {
  const { jobs, cap } = options
  let active = 0
  let maxActive = 0
  const release = Promise.withResolvers<void>()
  const otherRan = Promise.withResolvers<void>()
  const hold = async (): Promise<void> => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await release.promise
    active -= 1
  }
  const harness = await startBackgroundHarness({
    connection: options.connection,
    createProcessor: options.createProcessor,
    concurrency: cap + SPARE_SLOTS,
    // Ranked jobs become visible between blocking reads during the serial cap fill.
    workerOptions: { blockTimeout: 100 },
    bodies: {
      ...Object.fromEntries(jobs.map(job => [job.name, hold])),
      [SES_INBOUND_PROCESS_JOB.name]: () => otherRan.resolve(),
    },
  })
  try {
    const flood = []
    for (let index = 0; index < cap; index += 1) {
      const job = await harness.add(jobs[index % jobs.length]!, {})
      await harness.activated(job, 1)
      flood.push(job)
    }
    for (let index = 0; index < SPARE_SLOTS; index += 1) {
      flood.push(await harness.add(jobs[index % jobs.length]!, {}))
    }
    const sesMessageId = `ses-${randomUUID()}`
    const other = await harness.add(SES_INBOUND_PROCESS_JOB, {
      sesMessageId,
      objectKey: `copyright-incoming/${sesMessageId}`,
    })
    // The spare slots are free, and only the other domain's job can take one.
    await waitForRealGlideEvent(otherRan.promise, 'GlideMQ other-domain job')
    const maxWhileSaturated = maxActive
    release.resolve()
    await Promise.all([...flood, other].map(job => harness.settled(job)))
    return Math.max(maxWhileSaturated, maxActive)
  } finally {
    release.resolve()
    await harness.close()
  }
}
