import { TimeUnit } from '@glidemq/speedkey'
import type { Job, WorkerOptions } from 'glide-mq'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { registerWorkerQueueScriptFile } from './glide-mq-scripts.mts'

const releaseScript = registerWorkerQueueScriptFile('release-scheduled-run.lua', import.meta.url)
const DEFAULT_LOCK_DURATION_MS = 30_000
const DEFAULT_MAX_STALLED_COUNT = 2

/** A null release means this scheduler run was skipped because another run is live. */
export async function withScheduledRunLease(
  queue: string,
  job: Job,
  options: Pick<WorkerOptions, 'lockDuration' | 'maxStalledCount'>,
): Promise<(() => Promise<void>) | null> {
  if (!job.schedulerName) return async () => {}
  const baseKey = `${workerQueuePrefix ?? 'glide'}:{${queue}}`
  const scheduler = job.schedulerName
  const key = `${baseKey}:run:${scheduler}`
  const previousKey = `${key}:previous`
  const entry = await workerQueueCommandClient.hget(`${baseKey}:schedulers`, scheduler)
  const interval = scheduleInterval(entry)
  const lockDuration = job.opts.lockDuration ?? options.lockDuration ?? DEFAULT_LOCK_DURATION_MS
  const runtime =
    job.opts.timeout ?? lockDuration * ((options.maxStalledCount ?? DEFAULT_MAX_STALLED_COUNT) + 1)
  const ttl = Math.max(1, Math.min(runtime, interval ?? runtime))
  const acquired = await workerQueueCommandClient.set(key, job.id, {
    conditionalSet: 'onlyIfDoesNotExist',
    expiry: { type: TimeUnit.Milliseconds, count: ttl },
  })
  if (acquired === null) {
    await workerQueueCommandClient.hincrBy(`${baseKey}:run-metrics`, 'skipped_overlap', 1)
    console.info('skipped_overlap', { queue, scheduler, jobId: job.id })
    return null
  }
  const previous = await workerQueueCommandClient.get(previousKey)
  const previousJobId = previous === null ? null : decodeGlideString(previous)
  if (previousJobId !== null && previousJobId !== job.id)
    console.warn('overlap_lease_expired', {
      queue,
      scheduler,
      jobId: job.id,
      previousJobId,
    })
  await workerQueueCommandClient.set(previousKey, job.id, {
    expiry: { type: TimeUnit.Milliseconds, count: Math.max(ttl * 2, (interval ?? ttl) * 2) },
  })
  return async () => {
    await workerQueueCommandClient.invokeScript(releaseScript, {
      keys: [key, previousKey],
      args: [job.id],
    })
  }
}

function scheduleInterval(raw: string | Uint8Array | null): number | null {
  if (raw === null) return null
  try {
    const entry = JSON.parse(decodeGlideString(raw)) as {
      every?: number
      nextRun?: number
      lastRun?: number
    }
    if (entry.every && entry.every > 0) return entry.every
    if (entry.nextRun && entry.lastRun && entry.nextRun > entry.lastRun)
      return entry.nextRun - entry.lastRun
  } catch {
    // A malformed scheduler entry cannot leave a run with an unbounded lease.
  }
  return null
}

function decodeGlideString(value: string | Uint8Array): string {
  return typeof value === 'string' ? value : Buffer.from(value).toString('utf8')
}
