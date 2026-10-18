import { TimeUnit } from '@glidemq/speedkey'
import type { Job, WorkerOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { registerWorkerQueueScriptFile } from './glide-mq-scripts.mts'

const releaseScript = registerWorkerQueueScriptFile('release-scheduled-run.lua', import.meta.url)
const DEFAULT_LOCK_DURATION_MS = 30_000
const DEFAULT_MAX_STALLED_COUNT = 2
const ADMITTED_SCHEDULER_FIELD = 'scheduledRunLeaseAdmitted'

/** A null release means this scheduler run was skipped because another run is live. */
export async function withScheduledRunLease(
  queue: string,
  job: Job,
  options: Pick<WorkerOptions, 'lockDuration' | 'maxStalledCount' | 'prefix'>,
): Promise<(() => Promise<void>) | null> {
  if (!job.schedulerName) return async () => {}
  const baseKey = `${options.prefix ?? workerQueuePrefix ?? 'glide'}:{${queue}}`
  const scheduler = job.schedulerName
  const key = `${baseKey}:run:${scheduler}`
  const previousKey = `${key}:previous`
  const jobKey = `${baseKey}:job:${job.id}`
  const release = async () => {
    await workerQueueCommandClient.invokeScript(releaseScript, {
      keys: [key, previousKey],
      args: [job.id],
    })
  }
  const entry = await workerQueueCommandClient.hget(`${baseKey}:schedulers`, scheduler)
  const interval = scheduleInterval(entry)
  const lockDuration = job.opts.lockDuration ?? options.lockDuration ?? DEFAULT_LOCK_DURATION_MS
  const runtime =
    job.opts.timeout ?? lockDuration * ((options.maxStalledCount ?? DEFAULT_MAX_STALLED_COUNT) + 1)
  const ttl = Math.max(1, Math.min(runtime, interval ?? runtime))
  const completeAdmission = async () => {
    try {
      await workerQueueCommandClient.hset(jobKey, { [ADMITTED_SCHEDULER_FIELD]: scheduler })
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
      return release
    } catch (err) {
      try {
        await release()
      } catch (err) {
        // A failed cleanup must not hide the bookkeeping failure that triggered it.
        console.error('scheduled_lease_bookkeeping_release_failed', err)
      }
      throw err
    }
  }
  const acquired = await workerQueueCommandClient.set(key, job.id, {
    conditionalSet: 'onlyIfDoesNotExist',
    expiry: { type: TimeUnit.Milliseconds, count: ttl },
  })
  if (acquired === null) {
    const holder = await workerQueueCommandClient.get(key)
    // A retry of this same job may still own a lease after a failed release command.
    if (holder !== null && decodeGlideString(holder) === job.id) return completeAdmission()
    const admitted = await workerQueueCommandClient.hget(jobKey, ADMITTED_SCHEDULER_FIELD)
    if (admitted !== null && decodeGlideString(admitted) === scheduler) {
      // A retained sweep page or retry is already admitted work, not a fresh scheduler tick.
      // Keep its saved cursor by delaying it until the current holder finishes.
      await job.moveToDelayed(Date.now() + Math.min(ttl, 1000))
    }
    try {
      await workerQueueCommandClient.hincrBy(`${baseKey}:run-metrics`, 'skipped_overlap', 1)
    } catch (err) {
      try {
        onError(err instanceof Error ? err : new Error(String(err)))
      } catch (err) {
        console.error('scheduled_overlap_metric_reporting_failed', err)
      }
    }
    console.info('skipped_overlap', { queue, scheduler, jobId: job.id })
    return null
  }
  return completeAdmission()
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
