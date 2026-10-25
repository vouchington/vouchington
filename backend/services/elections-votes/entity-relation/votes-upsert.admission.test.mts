import { describe, expect, it, vi } from 'vitest'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import {
  beginTransaction,
  createTestPost,
  createTestTopic,
  createTestUser,
} from '@voucha/test-helpers'
import { getLatestTestEntityRelationVoteScore } from '@voucha/test-helpers/entities/entity-relation-votes'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'

const jobName = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name
const metadata = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  predicate: 'category',
  objectType: 'topic',
})

async function createFixture() {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const topic = await createTestTopic({ user })
  const [relation] = await upsertEntityRelation(user, metadata, post, [topic], { vote: false })
  if (!relation?.id) throw new Error('Expected owned category relation')
  const relationId = relation.id
  const readScore = () =>
    getLatestTestEntityRelationVoteScore({
      userId: user.id,
      relationId,
      relationTable: metadata.table_name,
    })
  return { user, post, topic, relationId, readScore }
}

function ownsVote(data: unknown, relationId: string): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'electionId' in data &&
    data.electionId === relationId &&
    'orderingKey' in data &&
    data.orderingKey === 'entity_relation'
  )
}

describe('entity relation vote admission', () => {
  it('keeps an owned mutation pending at admission after its ballot commits', async () => {
    const fixture = await createFixture()
    const gate = holdQueueBulkAdmission(voteAggregation, jobName, data =>
      ownsVote(data, fixture.relationId),
    )
    let entered = false
    void gate.entered.then(() => {
      entered = true
    })
    let settled = false
    const operation = upsertEntityRelationElectionVotes(
      fixture.user.id,
      [{ entityId: fixture.relationId, score: 1 }],
      undefined,
      metadata,
    ).finally(() => {
      settled = true
    })
    try {
      await gate.entered
      expect(await fixture.readScore()).toBe(1)
      expect(settled).toBe(false)
      gate.release()
      await expect(operation).resolves.toEqual([
        expect.objectContaining({ entity_id: fixture.relationId, score: 1 }),
      ])
      const jobs = await gate.admitted
      expect(jobs).toHaveLength(1)
      expect(await voteAggregation.getJob(jobs[0]!.id)).toMatchObject({
        name: jobName,
        data: {
          electionId: fixture.relationId,
          relationTable: metadata.table_name,
          orderingKey: 'entity_relation',
        },
      })
    } finally {
      gate.release()
      await operation.catch(() => undefined)
      if (entered) await removeEnqueuedJobs([gate.admitted.catch(() => [])], jobName)
      gate.restore()
    }
  })

  it('defers an inserted-row batch to its borrowed owner and joins admission at commit', async () => {
    const fixture = await createFixture()
    const otherMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'related',
      objectType: 'post',
    })
    const [other] = await upsertEntityRelation(
      fixture.user,
      otherMetadata,
      fixture.topic,
      [fixture.post],
      { vote: false },
    )
    if (!other?.id) throw new Error('Expected second owned relation')
    const otherId = other.id
    await upsertEntityRelationElectionVotes(
      fixture.user.id,
      [{ entityId: otherId, score: 1 }],
      undefined,
      otherMetadata,
      { enqueueVoteStats: false },
    )
    await using transaction = await beginTransaction()
    const gate = holdQueueBulkAdmission(
      voteAggregation,
      jobName,
      data => ownsVote(data, fixture.relationId) || ownsVote(data, otherId),
    )
    let entered = false
    void gate.entered.then(() => {
      entered = true
    })
    let committed = false
    let committing: Promise<void> | undefined
    try {
      const votes = await upsertEntityRelationElectionVotes(
        fixture.user.id,
        [
          { entityId: fixture.relationId, score: 1 },
          { entityId: otherId, score: 1 },
        ],
        undefined,
        [metadata, otherMetadata],
        { query: transaction, enqueueVoteStats: true },
      )
      expect(votes).toEqual([expect.objectContaining({ entity_id: fixture.relationId })])
      expect(await fixture.readScore()).toBeUndefined()
      expect(entered).toBe(false)
      committing = transaction.commit().finally(() => {
        committed = true
      })
      await gate.entered
      expect(await fixture.readScore()).toBe(1)
      expect(committed).toBe(false)
      gate.release()
      await committing
      const jobs = await gate.admitted
      expect(jobs).toHaveLength(1)
      expect(await voteAggregation.getJob(jobs[0]!.id)).toMatchObject({
        name: jobName,
        data: {
          electionId: fixture.relationId,
          relationTable: metadata.table_name,
          orderingKey: 'entity_relation',
        },
      })
    } finally {
      if (!committing) await transaction.rollback()
      gate.release()
      await committing?.catch(() => undefined)
      if (entered) await removeEnqueuedJobs([gate.admitted.catch(() => [])], jobName)
      gate.restore()
    }
  })

  it('publishes no ballot or admission when its borrowed owner rolls back', async () => {
    const fixture = await createFixture()
    await using transaction = await beginTransaction()
    const gate = holdQueueBulkAdmission(voteAggregation, jobName, data =>
      ownsVote(data, fixture.relationId),
    )
    let entered = false
    void gate.entered.then(() => {
      entered = true
    })
    try {
      await upsertEntityRelationElectionVotes(
        fixture.user.id,
        [{ entityId: fixture.relationId, score: 1 }],
        undefined,
        metadata,
        { query: transaction },
      )
      await transaction.rollback()
      expect(await fixture.readScore()).toBeUndefined()
      expect(entered).toBe(false)
    } finally {
      await transaction.rollback()
      gate.release()
      if (entered) await removeEnqueuedJobs([gate.admitted.catch(() => [])], jobName)
      gate.restore()
    }
  })

  it('reports rejected admission once without undoing a committed ballot', async () => {
    const fixture = await createFixture()
    const failure = new Error('Injected entity relation stats admission failure')
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    const originalAddBulk = voteAggregation.addBulk
    let matchingAdmissions = 0
    const spy = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
      if (jobs.some(job => job.name === jobName && ownsVote(job.data, fixture.relationId))) {
        matchingAdmissions += 1
        return Promise.reject(failure)
      }
      return originalAddBulk.call(voteAggregation, jobs)
    })
    try {
      await expect(
        upsertEntityRelationElectionVotes(
          fixture.user.id,
          [{ entityId: fixture.relationId, score: 1 }],
          undefined,
          metadata,
        ),
      ).resolves.toEqual([expect.objectContaining({ entity_id: fixture.relationId, score: 1 })])
      expect(await fixture.readScore()).toBe(1)
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reported]) => reported === failure),
      ).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })
})
