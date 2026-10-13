import { randomUUID } from 'node:crypto'
import { TestQueue, TestWorker } from 'glide-mq/testing'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  waitForOwnedVoteRouteJob,
  type OwnedVoteJobEnd,
} from '../test-helpers/owned-vote-route-job-completion.mts'
import { observeOwnedVoteRouteAdmissions } from '../test-helpers/owned-vote-route-admissions.mts'
import { createTestUserDirect } from '../test-helpers/entities/users-direct.mts'
import { insertTestTopic } from '../test-helpers/entities/topics.mts'

class RegisteredWaiters extends Map<string, (end: OwnedVoteJobEnd) => void> {
  registered = Promise.withResolvers<void>()
  override set(key: string, value: (end: OwnedVoteJobEnd) => void) {
    const result = super.set(key, value)
    this.registered.resolve()
    return result
  }
}

describe('owned vote-route admission settlement', () => {
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
    const { elections: worker } = await import('../workers/elections/workers.mts')
    const { elections: queue } = await import('../queues/elections/queues.mts')
    const { topicRatings } = await import('../queues/topic-ratings/queues.mts')
    const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
    let followUp: Promise<unknown> | undefined
    const completed = (job: { data: { electionId?: string } }) => {
      if (job.data.electionId !== topicId) return
      followUp = retry.retryTransientEnqueue(() =>
        topicRatings.add('unexpected-owned-review-job', { topicId }, { attempts: 1 }),
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
        'processUpdateElectionVoteStats',
        { electionId: topicId, orderingKey: 'topic' },
        { ordering: { key: 'topic' }, attempts: 1 },
      ),
    )
    const settlement = finish()
    void settlement.catch(() => {})
    await admission
    await expect(settlement).rejects.toThrow(
      'Topic ratings job unexpected-owned-review-job not found',
    )
    expect(followUp).toBeDefined()
  })
})
