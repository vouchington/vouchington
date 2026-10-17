import { randomUUID } from 'node:crypto'
import { TestQueue, TestWorker } from 'glide-mq/testing'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  waitForOwnedVoteRouteJob,
  type OwnedVoteJobEnd,
} from '../test-helpers/owned-vote-route-job-completion.mts'
import { observeOwnedVoteRouteAdmissions } from '../test-helpers/owned-vote-route-admissions.mts'
import { getSharedBackgroundWorker } from '../../test-helpers/shared-background-worker.mts'
import { createTestUserDirect } from '../test-helpers/entities/users-direct.mts'
import { insertTestTopic } from '../test-helpers/entities/topics.mts'
import { getEnqueuedJobId, readEnqueuedJob } from '../test-helpers/queue-jobs.mts'
import { settleVoteRouteOperations } from '../test-helpers/settle-vote-route-operations.mts'

class RegisteredWaiters extends Map<string, (end: OwnedVoteJobEnd) => void> {
  registered = Promise.withResolvers<void>()
  override set(key: string, value: (end: OwnedVoteJobEnd) => void) {
    const result = super.set(key, value)
    this.registered.resolve()
    return result
  }
}

describe('owned vote-route admission settlement', () => {
  it.each([
    { mode: 'single', skipped: null },
    { mode: 'bulk', skipped: [] },
  ] as const)(
    'rejects deduplicated $mode calls as fresh owned admissions',
    async ({ mode, skipped }) => {
      const user = await createTestUserDirect()
      const { voteAggregation: queue } = await import('../queues/vote-aggregation/queues.mts')
      const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
      const data = { userId: user.id }
      const opts = {
        delay: 300_000,
        deduplication: { id: randomUUID(), mode: 'simple' as const },
      }
      const admittedIds = new Set<string>()
      let closing = false
      const enqueue = async () => {
        const result = await retry.retryTransientEnqueue<unknown>(() => {
          if (closing) throw new Error('Owned dedup control is closing')
          return mode === 'single'
            ? queue.add('vote-aggregation.processRecalculateUserVoteWeight', data, opts)
            : queue.addBulk([
                { name: 'vote-aggregation.processRecalculateUserVoteWeight', data, opts },
              ])
        })
        for (const job of Array.isArray(result) ? result : [result])
          if (job !== null) admittedIds.add(getEnqueuedJobId(job))
        return result
      }
      let finish: Awaited<ReturnType<typeof observeOwnedVoteRouteAdmissions>> | undefined
      let settlement: Promise<void> | undefined
      let preparation: Promise<void> | undefined
      let failureAsserted = false
      onTestFinished(async () => {
        closing = true
        const errors: unknown[] = []
        const [prepared] = await Promise.allSettled([preparation])
        if (prepared?.status === 'rejected') errors.push(prepared.reason)
        if (finish) {
          settlement ??= finish()
          const [result] = await Promise.allSettled([settlement])
          if (result?.status === 'rejected' && !failureAsserted) errors.push(result.reason)
        }
        for (const id of admittedIds) {
          try {
            const job = await queue.getJob(id)
            if (!job || (job.data as { userId?: string }).userId !== user.id)
              throw new Error(`Cannot resolve owned dedup fixture ${id}`)
            const state = await job.getState()
            if (!['delayed', 'waiting', 'prioritized', 'completed', 'failed'].includes(state))
              throw new Error(`Cannot remove owned dedup fixture in state ${state}`)
            await job.remove()
          } catch (err) {
            errors.push(err)
          }
        }
        if (errors.length)
          throw new AggregateError(errors, 'Owned dedup control cleanup failed', {
            cause: errors[0],
          })
      })
      preparation = Promise.resolve().then(async () => {
        const first = await enqueue()
        if (closing) throw new Error('Owned dedup control is closing')
        const seeded = await readEnqueuedJob(queue, Array.isArray(first) ? first[0] : first)
        expect(seeded.data).toEqual(data)
        expect(await seeded.getState()).toBe('delayed')
        if (closing) throw new Error('Owned dedup control is closing')
        finish = await observeOwnedVoteRouteAdmissions(
          payload =>
            typeof payload === 'object' &&
            payload !== null &&
            'userId' in payload &&
            payload.userId === user.id,
          false,
        )
        if (closing) throw new Error('Owned dedup control is closing')
        finish.requireAdmission('vote-weight')
        const duplicate = await enqueue()
        expect(duplicate).toEqual(skipped)
        settlement = finish()
        await expect(settlement).rejects.toThrow(
          'No actual owned admission observed for vote-weight',
        )
        failureAsserted = true
        return undefined
      })
      await preparation
    },
  )

  it.each(['error', 'undefined'] as const)(
    'preserves raw %s primary failure and ordered secondary failures',
    async mode => {
      const primary = mode === 'error' ? new Error('Owned route primary') : undefined
      const secondary = new Error('Owned route secondary')
      const first = Promise.withResolvers<never>()
      first.reject(primary)
      const result = await settleVoteRouteOperations([
        first.promise,
        Promise.reject(secondary),
        Promise.resolve('independent route settled'),
      ]).then(
        () => {
          throw new Error('Expected actual route settlement failure')
        },
        err => err,
      )
      expect(result).toBeInstanceOf(AggregateError)
      expect(result.errors).toEqual([primary, secondary])
      expect(Object.hasOwn(result, 'cause')).toBe(true)
      expect(result.cause).toBe(primary)
    },
  )

  it.each([0, 10])(
    'retains a runnable public job with priority %s until its actual completion',
    async priority => {
      const queue = new TestQueue(`vote-wait-${randomUUID()}`)
      const waiters = new RegisteredWaiters()
      const ends = new Map<string, OwnedVoteJobEnd>()
      let worker: TestWorker | undefined
      const release = Promise.withResolvers<void>()
      onTestFinished(async () => {
        release.resolve()
        await worker?.close()
        await queue.close()
      })
      const job = await queue.add('owned', {}, { priority })
      if (!job) throw new Error('Expected actual public job')
      if (priority) await job.changePriority(priority)
      expect(await job.getState()).toBe(priority ? 'prioritized' : 'waiting')
      const key = `owned:${job.id}`
      const completion = waitForOwnedVoteRouteJob(
        job,
        key,
        new AbortController().signal,
        ends,
        waiters,
        [],
      )
      await waiters.registered.promise
      expect(waiters.has(key)).toBe(true)
      worker = new TestWorker(queue, async () => {
        await release.promise
        return 'done'
      })
      worker.on('completed', completed => {
        expect(completed.id).toBe(job.id)
        const end = { failed: false }
        ends.set(key, end)
        waiters.get(key)?.(end)
        waiters.delete(key)
      })
      release.resolve()
      await completion
      expect(await job.getState()).toBe('completed')
      expect(waiters.has(key)).toBe(false)
    },
  )

  it('retains a follow-up attempt admitted during actual election-worker settlement', async () => {
    const user = await createTestUserDirect()
    const topicId = await insertTestTopic({
      name: randomUUID(),
      slug: randomUUID(),
      createdById: user.id,
    })
    const owns = (data: unknown) =>
      typeof data === 'object' &&
      data !== null &&
      (('electionId' in data && data.electionId === topicId) ||
        ('topicId' in data && data.topicId === topicId))
    const finish = await observeOwnedVoteRouteAdmissions(owns)
    const worker = getSharedBackgroundWorker()
    const { voteAggregation: queue } = await import('../queues/vote-aggregation/queues.mts')
    const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
    let followUp: Promise<unknown> | undefined
    const completed = (job: { data: { electionId?: string } }) => {
      if (job.data.electionId !== topicId) return
      followUp = retry.retryTransientEnqueue(() =>
        queue.add('unexpected-owned-review-job', { topicId }, { attempts: 1 }),
      )
      void followUp.catch(() => {})
    }
    worker.on('completed', completed)
    onTestFinished(async () => {
      worker.off('completed', completed)
      await Promise.allSettled([followUp].filter(value => value !== undefined))
    })
    const admission = retry.retryTransientEnqueue(() =>
      queue.add(
        'vote-aggregation.processUpdateElectionVoteStats',
        { electionId: topicId, orderingKey: 'topic' },
        { attempts: 1 },
      ),
    )
    const settlement = finish()
    void settlement.catch(() => {})
    await admission
    await expect(settlement).rejects.toThrow('Unknown background job: unexpected-owned-review-job')
    expect(followUp).toBeDefined()
  })
})
