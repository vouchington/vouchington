import { afterEach, describe, expect, it, vi } from 'vitest'
import { QUEUE_NAME } from '@queues/elections/config'
import { getOrCreateQueue } from '../../../test-helpers/glide-mq-vitest-internals.mts'
import { onceElectionVoteStatsCompleted } from './test-support.mts'
import { elections as electionsWorker } from './workers.mts'

const JOB_NAME = 'processUpdateElectionVoteStats'

type EmittableWorker = { emit(event: string, ...args: unknown[]): boolean }

function emitOnWorker(event: string, ...args: unknown[]): void {
  ;(electionsWorker as unknown as EmittableWorker).emit(event, ...args)
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

async function addCompletedJob(electionId: string): Promise<void> {
  const queue = getOrCreateQueue(QUEUE_NAME)
  const job = await queue.add(JOB_NAME, { electionId })
  const record = queue.jobs.get(job!.id)
  record!.state = 'completed'
}

async function addFailedJob(electionId: string, failedReason: string): Promise<void> {
  const queue = getOrCreateQueue(QUEUE_NAME)
  const job = await queue.add(JOB_NAME, { electionId })
  const record = queue.jobs.get(job!.id)
  record!.state = 'failed'
  record!.failedReason = failedReason
}

describe('onceElectionVoteStatsCompleted', () => {
  // This module's queue is a process-wide singleton (getOrCreateQueue), so completed jobs from one
  // test are still visible to the next test's searchJobs scan unless cleared here.
  afterEach(() => {
    getOrCreateQueue(QUEUE_NAME).jobs.clear()
  })

  it('resolves when the matching job already completed before the listener registered', async () => {
    const electionId = crypto.randomUUID()
    await addCompletedJob(electionId)

    await expect(onceElectionVoteStatsCompleted(electionId, 1, 500)).resolves.toBeUndefined()
  })

  it('rejects with a timeout when only a non-matching election completes', async () => {
    const electionId = crypto.randomUUID()
    const promise = onceElectionVoteStatsCompleted(electionId, 1, 50)
    const promiseRejection = promise.catch((error: unknown) => error)
    await flushMicrotasks()
    emitOnWorker('completed', { name: JOB_NAME, data: { electionId: crypto.randomUUID() } })

    await expect(promiseRejection).resolves.toMatchObject({
      message: `onceElectionVoteStatsCompleted timed out after 50ms waiting for election ${electionId}`,
    })
  })

  it('resolves once the matching job completes via a live worker event', async () => {
    const electionId = crypto.randomUUID()
    const promise = onceElectionVoteStatsCompleted(electionId, 1, 500)
    await flushMicrotasks()
    emitOnWorker('completed', { name: JOB_NAME, data: { electionId } })

    await expect(promise).resolves.toBeUndefined()
  })

  it('rejects when the matching job fails, rather than waiting for the timeout', async () => {
    const electionId = crypto.randomUUID()
    const promise = onceElectionVoteStatsCompleted(electionId, 1, 500)
    const promiseRejection = promise.catch((error: unknown) => error)
    await flushMicrotasks()
    emitOnWorker('failed', { name: JOB_NAME, data: { electionId } }, new Error('boom'))

    await expect(promiseRejection).resolves.toMatchObject({
      message: `Elections vote-stats job for election ${electionId} failed: boom`,
    })
  })

  it('resolves for count > 1 once a pre-completed job and a live completion together satisfy it', async () => {
    const electionId = crypto.randomUUID()
    await addCompletedJob(electionId)

    const promise = onceElectionVoteStatsCompleted(electionId, 2, 500)
    await flushMicrotasks()
    emitOnWorker('completed', { name: JOB_NAME, data: { electionId } })

    await expect(promise).resolves.toBeUndefined()
  })

  it('does not reject on a non-matching failed event, and still resolves on the matching completion', async () => {
    const electionId = crypto.randomUUID()
    const promise = onceElectionVoteStatsCompleted(electionId, 1, 500)
    await flushMicrotasks()
    emitOnWorker(
      'failed',
      { name: JOB_NAME, data: { electionId: crypto.randomUUID() } },
      new Error('unrelated failure'),
    )
    emitOnWorker('completed', { name: JOB_NAME, data: { electionId } })

    await expect(promise).resolves.toBeUndefined()
  })

  it('rejects when the pre-count completed-jobs search itself fails, rather than waiting for the timeout', async () => {
    const electionId = crypto.randomUUID()
    const queue = getOrCreateQueue(QUEUE_NAME)
    const searchJobsSpy = vi
      .spyOn(queue, 'searchJobs')
      .mockRejectedValueOnce(new Error('search boom'))

    await expect(onceElectionVoteStatsCompleted(electionId, 1, 500)).rejects.toThrow('search boom')

    searchJobsSpy.mockRestore()
  })

  it('rejects immediately when the matching job already failed before the listener registered', async () => {
    const electionId = crypto.randomUUID()
    await addFailedJob(electionId, 'boom')

    await expect(onceElectionVoteStatsCompleted(electionId, 1, 500)).rejects.toThrow(
      `Elections vote-stats job for election ${electionId} failed: boom`,
    )
  })

  it('does not resolve a later call off a completion an earlier call for the same election already consumed', async () => {
    const electionId = crypto.randomUUID()
    await addCompletedJob(electionId)
    await expect(onceElectionVoteStatsCompleted(electionId, 1, 500)).resolves.toBeUndefined()

    const promise = onceElectionVoteStatsCompleted(electionId, 1, 50)
    const promiseRejection = promise.catch((error: unknown) => error)
    await flushMicrotasks()

    await expect(promiseRejection).resolves.toMatchObject({
      message: `onceElectionVoteStatsCompleted timed out after 50ms waiting for election ${electionId}`,
    })
  })

  it('resolves a later call once a genuinely new job completes, unblocked by the earlier consumed job', async () => {
    const electionId = crypto.randomUUID()
    await addCompletedJob(electionId)
    await expect(onceElectionVoteStatsCompleted(electionId, 1, 500)).resolves.toBeUndefined()

    const promise = onceElectionVoteStatsCompleted(electionId, 1, 500)
    await flushMicrotasks()
    emitOnWorker('completed', { id: crypto.randomUUID(), name: JOB_NAME, data: { electionId } })

    await expect(promise).resolves.toBeUndefined()
  })

  it('narrows entity_relation completions by relationTable', async () => {
    const electionId = crypto.randomUUID()
    const match = onceElectionVoteStatsCompleted(electionId, 1, 500, 'my_table')
    await flushMicrotasks()
    emitOnWorker('completed', {
      name: JOB_NAME,
      data: { electionId, relationTable: 'other_table' },
    })
    emitOnWorker('completed', { name: JOB_NAME, data: { electionId, relationTable: 'my_table' } })

    await expect(match).resolves.toBeUndefined()
  })
})
