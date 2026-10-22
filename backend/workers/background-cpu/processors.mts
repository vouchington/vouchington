import { clampRateLimitDelayMs, UnrecoverableError } from '@vouchington/queue-errors'
import { getPauseRecheckMs, type BackgroundCpuDomain } from '@queues/background-cpu/config'
import {
  getBackgroundCpuDomainDefinition,
  getBackgroundCpuJob,
} from '@queues/background-cpu/enqueues/registry'
import type { BackgroundCpuHandler } from '@queues/background-cpu/types'
import { runBedrockJobWithProviderCooldown } from '@workers/bedrock-embeddings/processors/provider-cooldown'
import { runUnlessQueueDomainPaused } from '@services/queue-domain-controls'
import { Worker, type Job } from 'glide-mq'

/** A registered job this worker was not asked to serve waits here until a worker that serves it runs. */
const UNSERVED_JOB_PARK_MS = 24 * 60 * 60_000

/**
 * The shared worker's processor: runs the handler registered for the job's name unless the job's
 * domain is paused, and turns every provider rate-limit signal into a deferral of that job or its
 * group. `Worker.RateLimitError` and `worker.rateLimit()` would idle the whole shared worker, so
 * neither ever reaches GlideMQ from here.
 */
export function createBackgroundCpuProcessor(handlers: ReadonlyMap<string, BackgroundCpuHandler>) {
  return async function processBackgroundCpuJob(job: Job): Promise<unknown> {
    const handler = handlers.get(job.name)
    if (!handler) return rejectUnservedJob(job)
    const { domain } = handler.job
    return runUnlessQueueDomainPaused(
      domain,
      () => runWithProviderCooldown(job, handler),
      () => deferJob(job, domain, getPauseRecheckMs()),
    )
  }
}

async function runWithProviderCooldown(job: Job, handler: BackgroundCpuHandler): Promise<unknown> {
  // Only Bedrock handlers use an external provider lane. Other CPU domains must remain
  // independent of the rate-limiter Valkey connection.
  const groupKey = handler.job.domain === 'bedrock-embeddings' ? job.groupKey : undefined
  if (handler.job.domain === 'bedrock-embeddings') {
    return runBedrockJobWithProviderCooldown(job, groupKey, async () => handler.handle(job))
  }
  try {
    return await handler.handle(job)
  } catch (err) {
    if (!(err instanceof Worker.RateLimitError)) throw err
    return deferJob(
      job,
      handler.job.domain,
      clampRateLimitDelayMs((err as { delayMs?: number }).delayMs),
    )
  }
}

/**
 * A paused domain with a shared group parks that group; a domain with independent lanes delays
 * only the current job. The job rechecks the durable pause control when it activates again.
 */
function deferJob(job: Job, domain: BackgroundCpuDomain, delayMs: number): Promise<never> {
  const { group } = getBackgroundCpuDomainDefinition(domain)
  if (group?.kind === 'domain' && group.deferral !== 'job' && job.groupKey === domain) {
    return job.rateLimitGroup(delayMs)
  }
  return job.moveToDelayed(Date.now() + delayMs)
}

function rejectUnservedJob(job: Job): Promise<never> {
  if (getBackgroundCpuJob(job.name)) return job.moveToDelayed(Date.now() + UNSERVED_JOB_PARK_MS)
  throw new UnrecoverableError(`Unknown background-cpu job: ${job.name}`)
}
