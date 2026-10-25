import { describe, expect, it, vi } from 'vitest'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { createTestUser } from '@voucha/test-helpers'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { getRssFeedItemElectionVote } from './votes-get.mts'
import { upsertRssFeedItemElectionVotes } from './votes-upsert.mts'

describe('RSS feed item vote admission', () => {
  it('waits for stats admission after committing the ballot', async () => {
    const user = await createTestUser()
    const itemId = (await createTestStoryMembers(1)).itemIds[0]!
    const jobName = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name
    const admission = holdQueueBulkAdmission(
      voteAggregation,
      jobName,
      data =>
        typeof data === 'object' &&
        data !== null &&
        'electionId' in data &&
        data.electionId === itemId &&
        'orderingKey' in data &&
        data.orderingKey === 'rss_feed_item',
    )
    let entered = false
    void admission.entered.then(() => {
      entered = true
    })
    let settled = false
    let operation: ReturnType<typeof upsertRssFeedItemElectionVotes> | undefined
    try {
      operation = upsertRssFeedItemElectionVotes(user.id, [{ entityId: itemId, score: 1 }]).finally(
        () => {
          settled = true
        },
      )
      await admission.entered
      expect(await getRssFeedItemElectionVote(user.id, itemId)).toMatchObject({
        entity_id: itemId,
        user_id: user.id,
        choice: 'like',
      })
      expect(settled).toBe(false)

      admission.release()
      const [votes, jobs] = await Promise.all([operation, admission.admitted])
      expect(votes).toEqual([expect.objectContaining({ entity_id: itemId, score: 1 })])
      expect(jobs).toEqual([
        expect.objectContaining({
          name: jobName,
          data: { electionId: itemId, orderingKey: 'rss_feed_item' },
        }),
      ])
    } finally {
      admission.release()
      try {
        await operation?.catch(() => undefined)
        if (entered) await removeEnqueuedJobs([admission.admitted.catch(() => [])], jobName)
      } finally {
        admission.restore()
      }
    }
  })

  it('keeps a committed ballot when stats admission fails and reports the failure once', async () => {
    const user = await createTestUser()
    const itemId = (await createTestStoryMembers(1)).itemIds[0]!
    const admissionError = new Error('Injected RSS vote stats admission failure')
    const originalAddBulk = voteAggregation.addBulk
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    let matchingAdmissions = 0
    const addBulkSpy = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
      if (
        jobs.some(
          job =>
            job.name === VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name &&
            typeof job.data === 'object' &&
            job.data !== null &&
            'electionId' in job.data &&
            job.data.electionId === itemId &&
            'orderingKey' in job.data &&
            job.data.orderingKey === 'rss_feed_item',
        )
      ) {
        matchingAdmissions += 1
        return Promise.reject(admissionError)
      }
      return originalAddBulk.call(voteAggregation, jobs)
    })

    try {
      const votes = await upsertRssFeedItemElectionVotes(user.id, [{ entityId: itemId, score: 1 }])
      expect(votes).toEqual([expect.objectContaining({ entity_id: itemId, score: 1 })])
      await expect(getRssFeedItemElectionVote(user.id, itemId)).resolves.toMatchObject({
        entity_id: itemId,
        user_id: user.id,
        choice: 'like',
      })
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reportedError]) => reportedError === admissionError),
      ).toHaveLength(1)
    } finally {
      addBulkSpy.mockRestore()
    }
  })
})
