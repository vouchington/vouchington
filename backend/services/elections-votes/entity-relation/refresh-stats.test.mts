import { describe, expect, it, vi } from 'vitest'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { createTestPost, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { getEntityRelation } from '@voucha/test-helpers/entities/entity-relations'
import { insertTestEntityRelationVote } from '@voucha/test-helpers/entities/entity-relation-votes'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { refreshEntityRelationVoteStatsFromPrimaryWithFallback } from './refresh-stats.mts'
import { createEntityRelationElectionTarget } from './target.mts'

const metadata = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  predicate: 'category',
  objectType: 'topic',
})
const jobName = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name
const AGGREGATE_MARKER = 'aggregateElectionVoteStats'

async function createVotedRelation() {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const topic = await createTestTopic({ user })
  const [relation] = await upsertEntityRelation(user, metadata, post, [topic], { vote: false })
  if (!relation?.id) throw new Error('Expected owned category relation')
  await insertTestEntityRelationVote({
    relationTable: metadata.table_name,
    relationId: relation.id,
    subjectId: post.id,
    userId: user.id,
    score: 1,
  })
  return {
    target: createEntityRelationElectionTarget(relation.id, metadata.table_name),
    readStats: async () => {
      const [row] = (await getEntityRelation(metadata.table_name, post.id, topic.id)) as Array<{
        votes_count_up: number
        votes_count_none: number
        votes_count_down: number
      }>
      return row
    },
  }
}

describe('refreshEntityRelationVoteStatsFromPrimaryWithFallback', () => {
  it('writes the aggregated vote counts onto the owned relation row', async () => {
    const { target, readStats } = await createVotedRelation()

    await refreshEntityRelationVoteStatsFromPrimaryWithFallback(target)

    expect(await readStats()).toMatchObject({
      votes_count_up: 1,
      votes_count_none: 0,
      votes_count_down: 0,
    })
  })

  it('enqueues a reconciliation job for the complete target when the primary refresh fails', async () => {
    const { target } = await createVotedRelation()
    const gate = holdQueueBulkAdmission(
      voteAggregation,
      jobName,
      data =>
        typeof data === 'object' &&
        data !== null &&
        'electionId' in data &&
        data.electionId === target.entityRelationId,
    )
    const restoreWrite = rejectPostgresWriteForTest(AGGREGATE_MARKER, new Error('primary down'))

    try {
      const operation = refreshEntityRelationVoteStatsFromPrimaryWithFallback(target)
      await gate.entered
      gate.release()
      await expect(operation).resolves.toBeUndefined()
    } finally {
      restoreWrite()
    }

    const jobs = await gate.admitted
    try {
      expect(jobs).toHaveLength(1)
      expect(await voteAggregation.getJob(jobs[0]!.id)).toMatchObject({
        name: jobName,
        data: {
          electionId: target.entityRelationId,
          relationTable: metadata.table_name,
          orderingKey: 'entity_relation',
        },
      })
    } finally {
      await removeEnqueuedJobs([Promise.resolve(jobs)], jobName)
    }
  })

  it('throws only when the primary refresh and the fallback enqueue both fail', async () => {
    const target = {
      entityRelationId: crypto.randomUUID(),
      relationTable: 'relation__not__real',
    } as never

    const refresh = () => refreshEntityRelationVoteStatsFromPrimaryWithFallback(target)

    await expect(refresh()).rejects.toThrow(
      'Primary entity-relation vote refresh failed (Unknown elected entity relation: relation__not__real) and fallback enqueue also failed',
    )
    await expect(refresh()).rejects.toMatchObject({
      cause: new Error('Unknown election entity-relation table: relation__not__real'),
    })
  })

  it('describes a non-Error primary failure when the fallback enqueue also fails', async () => {
    const { target } = await createVotedRelation()
    const restoreWrite = rejectPostgresWriteForTest(AGGREGATE_MARKER, 'primary unavailable')
    vi.spyOn(voteAggregation, 'addBulk').mockRejectedValueOnce(new Error('queue unavailable'))

    try {
      await expect(refreshEntityRelationVoteStatsFromPrimaryWithFallback(target)).rejects.toThrow(
        'Primary entity-relation vote refresh failed (primary unavailable) and fallback enqueue also failed',
      )
    } finally {
      restoreWrite()
      vi.restoreAllMocks()
    }
  })
})

describe('createEntityRelationElectionTarget', () => {
  it.each([undefined, 'relation__not__real'])(
    'rejects invalid election relation table %s',
    relationTable => {
      expect(() => createEntityRelationElectionTarget('relation-1', relationTable)).toThrow(
        'Unknown election entity-relation table',
      )
    },
  )
})
