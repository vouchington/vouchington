import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Queue, QueueEvents, Worker, type Job, type JobOptions } from 'glide-mq'
import { expect } from 'vitest'
import {
  MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS,
  membershipVerificationOrdering,
  QUEUE_NAME,
} from '../queues/memberships/config.mts'
import { realGlideConnection } from './real-glide-connection.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'

const verificationOptions = (verificationId: string): JobOptions => ({
  attempts: 3,
  jobId: verificationId,
  lockDuration: MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS,
  ordering: membershipVerificationOrdering(verificationId),
  deduplication: { id: verificationId, mode: 'simple' },
})

export function nextVerificationOutcome(events: QueueEvents, signal: AbortSignal) {
  return Promise.race([
    once(events, 'delay-changed', { signal }).then(([event]) => ({
      kind: 'delayed' as const,
      event,
    })),
    once(events, 'completed', { signal }).then(([event]) => ({
      kind: 'completed' as const,
      event,
    })),
    once(events, 'failed', { signal }).then(([event]) => ({
      kind: 'failed' as const,
      event,
    })),
  ])
}

export async function addVerificationJob(queue: Queue, verificationId: string): Promise<Job> {
  const job = await queue.add(
    'processMembershipVerification',
    { verificationId },
    verificationOptions(verificationId),
  )
  if (!job) throw new Error(`Expected ${verificationId} verification job`)
  return job
}

export async function expectDelayOutcome(options: {
  outcome: ReturnType<typeof nextVerificationOutcome>
  queue: Queue
  job: Job
  startedAt: number
  minDelayMs: number
  maxDelayMs: number
}): Promise<void> {
  const result = await waitForRealGlideEvent(
    options.outcome,
    `GlideMQ membership verification delay ${options.job.id}`,
  )
  expect(result.kind).toBe('delayed')
  const event = result.event
  expect(event).toMatchObject({ jobId: options.job.id })
  const delayMs = Number((event as { delay: string }).delay)
  const elapsedMs = Date.now() - options.startedAt
  expect(delayMs).toBeGreaterThanOrEqual(options.minDelayMs - elapsedMs)
  expect(delayMs).toBeLessThanOrEqual(options.maxDelayMs)
  const stored = await options.queue.getJob(options.job.id)
  expect(await stored?.getState()).toBe('delayed')
  expect(stored?.attemptsMade).toBe(0)
}

export async function expectCanonicalDelay(
  queue: Queue,
  job: Job,
  verificationId: string,
): Promise<void> {
  const stored = await queue.getJob(job.id)
  expect(await stored?.getState()).toBe('delayed')
  expect(stored?.attemptsMade).toBe(0)
  await expect(
    queue.add(
      'processMembershipVerification',
      { verificationId },
      verificationOptions(verificationId),
    ),
  ).resolves.toBeNull()
  expect(await stored?.getState()).toBe('delayed')
}

/** An isolated real GlideMQ queue with its events and worker, closed together. */
export async function openMembershipQueueHarness(
  prefix: string,
  processor: (job: Job) => Promise<void>,
  workerOptions: Record<string, unknown>,
) {
  const queueName = `${QUEUE_NAME}_${prefix}_${randomUUID()}`
  const queue = new Queue(queueName, realGlideConnection)
  const events = new QueueEvents(queueName, {
    ...realGlideConnection,
    lastEventId: '0',
    blockTimeout: 1_000,
  })
  const worker = new Worker(queueName, processor, { ...realGlideConnection, ...workerOptions })
  await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
  return {
    queue,
    events,
    async close() {
      await Promise.all([worker.close(true), events.close()])
      await queue.obliterate({ force: true })
      await queue.close()
    },
  }
}

/** Runs `trigger`, then expects the next queue event to delay `job` (or the job it returns). */
export async function expectDelayAfter(options: {
  events: QueueEvents
  signal: AbortSignal
  queue: Queue
  job?: Job
  minDelayMs: number
  maxDelayMs: number
  trigger: () => Promise<Job | void> | void
}): Promise<Job> {
  const startedAt = Date.now()
  const outcome = nextVerificationOutcome(options.events, options.signal)
  const triggered = await options.trigger()
  const job = options.job ?? triggered
  if (!job) throw new Error('Expected a job to observe')
  await expectDelayOutcome({ ...options, job, outcome, startedAt })
  return job
}
