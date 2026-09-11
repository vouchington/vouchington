import { emit } from './emit.mts'
import type { QueueJobRecord } from './table-records.mts'

function makeBase(): Pick<QueueJobRecord, 'event_id' | 'event_time' | 'event_date' | 'env'> {
  const now = new Date()
  return {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
  }
}

export function trackJobEnqueue(queue: string, job: string, count: number = 1): void {
  emit('queue_jobs', {
    ...makeBase(),
    queue,
    job,
    event: 'enqueued',
    count,
  })
}

export function trackQueueWorkerEvent(queue: string, event: string): void {
  const now = new Date()
  emit('queue_workers', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    queue,
    event,
  })
}

export function trackQueueWorkerJobProgressEvent(
  queue: string,
  job: string,
  event: 'active' | 'paused' | 'resumed' | 'stalled' | 'progress',
): void {
  emit('queue_jobs', {
    ...makeBase(),
    queue,
    job,
    event,
  })
}

export function trackQueueWorkerJobCompletedEvent(
  queue: string,
  job: string,
  event: 'completed' | 'failed',
  durationMs: number,
): void {
  emit('queue_jobs', {
    ...makeBase(),
    queue,
    job,
    event,
    duration_ms: durationMs,
  })
}
