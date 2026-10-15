import { randomUUID } from 'node:crypto'
import { it, expect, describe, afterEach, vi } from 'vitest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  buildElectionJobOptions,
  enqueueBulkUpdateEntityRelationElectionVoteStats,
  enqueueBulkUpdatePostElectionVoteStats,
  enqueueBulkUpdateTopicElectionVoteStats,
} from './elections.mts'
import { ELECTIONS_DEFAULTS } from './config-elections.mts'
import {
  ELECTION_LANE_ORDERING,
  ELECTION_LANES,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import type { EntityRelationElectionTable } from './types-elections.mts'

describe('buildElectionJobOptions', () => {
  it('runs after the throttle window plus the replica-lag safety margin', () => {
    const opts = buildElectionJobOptions('election-1', 'post')

    expect(ELECTIONS_DEFAULTS.deduplicationTtlMs).toBe(5_000)
    expect(ELECTIONS_DEFAULTS.replicaLagSafetyMarginMs).toBe(1_000)
    expect(ELECTIONS_DEFAULTS.recomputeDelayMs).toBe(6_000)
    expect(ELECTIONS_DEFAULTS.recomputeDelayMs).toBe(
      ELECTIONS_DEFAULTS.deduplicationTtlMs + ELECTIONS_DEFAULTS.replicaLagSafetyMarginMs,
    )
    expect(opts.delay).toBe(ELECTIONS_DEFAULTS.recomputeDelayMs)
  })

  it('throttles each election ID for five seconds', () => {
    const opts = buildElectionJobOptions('election-1', 'post')

    expect(opts.deduplication).toEqual({
      id: 'processUpdateElectionVoteStats__post__election-1',
      mode: 'throttle',
      ttl: 5_000,
    })
  })

  it.each(ELECTION_LANES)('orders the %s lane under its namespaced key', orderingKey => {
    const opts = buildElectionJobOptions('election-1', orderingKey)

    expect(opts.ordering).toEqual({ key: `vote-aggregation:${orderingKey}`, concurrency: 100 })
    expect(opts.ordering).toBe(ELECTION_LANE_ORDERING[orderingKey])
  })

  it('includes the relation table in entity-relation deduplication identity', () => {
    const first = buildElectionJobOptions(
      'election-1',
      'entity_relation',
      'relation__topic__related__post',
    )
    const second = buildElectionJobOptions(
      'election-1',
      'entity_relation',
      'relation__topic__faq__post',
    )

    expect(first.deduplication.id).not.toBe(second.deduplication.id)
    expect(first.deduplication.id).toContain('relation__topic__related__post')
  })

  it('rejects entity-relation tables outside election metadata', () => {
    expect(() =>
      enqueueBulkUpdateEntityRelationElectionVoteStats([
        { entityRelationId: 'election-1', relationTable: 'relation__not__real' } as never,
      ]),
    ).toThrow('Unknown election entity-relation table')
  })

  it('enqueues entity-relation jobs with the required ordering key and relation table', async () => {
    const target = {
      entityRelationId: crypto.randomUUID(),
      relationTable: 'relation__post__related__url' as EntityRelationElectionTable,
    }
    await enqueueBulkUpdateEntityRelationElectionVoteStats([target])

    const jobs = await voteAggregation.searchJobs({
      name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
      data: { electionId: target.entityRelationId },
    })
    expect(jobs.map(job => job.data)).toContainEqual({
      electionId: target.entityRelationId,
      orderingKey: 'entity_relation',
      relationTable: target.relationTable,
    })
    expect(jobs[0]?.opts).toMatchObject({
      priority: 10,
      attempts: 3,
      ordering: { key: 'vote-aggregation:entity_relation', concurrency: 100 },
    })
  })
})

describe('election enqueue call options', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recomputes a post election at the requested priority', async () => {
    const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockResolvedValueOnce([])
    const electionId = randomUUID()

    await enqueueBulkUpdatePostElectionVoteStats([electionId], 41)

    expect(addBulk).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
        data: { electionId, orderingKey: 'post' },
        opts: expect.objectContaining({ priority: 41 }),
      }),
    ])
  })

  it('tags a rejected admission as critical with the election context', async () => {
    const failure = new Error('election admission rejected')
    vi.spyOn(voteAggregation, 'addBulk').mockRejectedValueOnce(failure)

    await expect(
      enqueueBulkUpdateTopicElectionVoteStats([randomUUID(), randomUUID()]),
    ).rejects.toBe(failure)

    expect(failure).toMatchObject({
      extra: {
        queue: BACKGROUND_QUEUE_NAME,
        operation: 'enqueueBulkUpdateTopicElectionVoteStats',
        electionCount: 2,
      },
      tags: { critical: true },
    })
  })
})
