import { randomUUID } from 'node:crypto'
import { it, expect, describe, afterEach, onTestFinished, vi } from 'vitest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  enqueueBulkUpdateAgentModerationElectionVoteStats,
  enqueueBulkUpdateEntityRelationElectionVoteStats,
  enqueueBulkUpdateHostnameElectionVoteStats,
  enqueueBulkUpdatePostElectionVoteStats,
  enqueueBulkUpdateRssFeedItemElectionVoteStats,
  enqueueBulkUpdateTopicElectionVoteStats,
  enqueueBulkUpdateUserVouchElectionVoteStats,
} from './elections.mts'
import { ELECTIONS_DEFAULTS } from '../config.mts'
import {
  ELECTION_LANES,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import type { EntityRelationElectionTable } from './types-elections.mts'

describe('election enqueue options', () => {
  async function admittedPostOptions() {
    const electionId = randomUUID()
    await enqueueBulkUpdatePostElectionVoteStats([electionId])
    const jobs = await voteAggregation.searchJobs({
      name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
      data: { electionId },
    })
    expect(jobs).toHaveLength(1)
    return jobs[0]!.opts
  }

  it('runs after the throttle window plus the replica-lag safety margin', async () => {
    const opts = await admittedPostOptions()

    expect(ELECTIONS_DEFAULTS.deduplicationTtlMs).toBe(5_000)
    expect(ELECTIONS_DEFAULTS.replicaLagSafetyMarginMs).toBe(1_000)
    expect(ELECTIONS_DEFAULTS.recomputeDelayMs).toBe(6_000)
    expect(ELECTIONS_DEFAULTS.recomputeDelayMs).toBe(
      ELECTIONS_DEFAULTS.deduplicationTtlMs + ELECTIONS_DEFAULTS.replicaLagSafetyMarginMs,
    )
    expect(opts.delay).toBe(ELECTIONS_DEFAULTS.recomputeDelayMs)
  })

  it('throttles each election ID for five seconds', async () => {
    const electionId = randomUUID()
    await enqueueBulkUpdatePostElectionVoteStats([electionId])
    const [job] = await voteAggregation.searchJobs({
      name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
      data: { electionId },
    })

    expect(job?.opts.deduplication).toEqual({
      id: `processUpdateElectionVoteStats__post__${electionId}`,
      mode: 'throttle',
      ttl: 5_000,
    })
  })

  it.each(ELECTION_LANES)('leaves the %s lane to the domain-wide group', async orderingKey => {
    const electionId = randomUUID()
    switch (orderingKey) {
      case 'post':
        await enqueueBulkUpdatePostElectionVoteStats([electionId])
        break
      case 'topic':
        await enqueueBulkUpdateTopicElectionVoteStats([electionId])
        break
      case 'hostname':
        await enqueueBulkUpdateHostnameElectionVoteStats([electionId])
        break
      case 'agent_moderation':
        await enqueueBulkUpdateAgentModerationElectionVoteStats([electionId])
        break
      case 'rss_feed_item':
        await enqueueBulkUpdateRssFeedItemElectionVoteStats([electionId])
        break
      case 'user_vouch':
        await enqueueBulkUpdateUserVouchElectionVoteStats([electionId])
        break
      case 'entity_relation':
        await enqueueBulkUpdateEntityRelationElectionVoteStats([
          {
            entityRelationId: electionId,
            relationTable: 'relation__post__related__url' as EntityRelationElectionTable,
          },
        ])
        break
    }
    const jobs = await voteAggregation.searchJobs({
      name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
      data: { electionId },
    })
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toMatchObject({ electionId, orderingKey })
    expect(jobs[0]?.opts.ordering).toEqual(VOTE_AGGREGATION_UPDATE_ELECTION_JOB.options.ordering)
  })

  it('includes the relation table in entity-relation deduplication identity', async () => {
    const electionId = randomUUID()
    const tables = [
      'relation__topic__related__post',
      'relation__topic__faq__post',
    ] as EntityRelationElectionTable[]
    await enqueueBulkUpdateEntityRelationElectionVoteStats(
      tables.map(relationTable => ({ entityRelationId: electionId, relationTable })),
    )
    const jobs = await voteAggregation.searchJobs({
      name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
      data: { electionId },
    })
    expect(jobs).toHaveLength(2)
    const ids = jobs.map(job => job.opts.deduplication?.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids).toContain(
      `processUpdateElectionVoteStats__entity_relation__${tables[0]}__${electionId}`,
    )
    expect(ids).toContain(
      `processUpdateElectionVoteStats__entity_relation__${tables[1]}__${electionId}`,
    )
  })

  it('rejects entity-relation tables outside election metadata', () => {
    expect(() =>
      enqueueBulkUpdateEntityRelationElectionVoteStats([
        { entityRelationId: 'election-1', relationTable: 'relation__not__real' } as never,
      ]),
    ).toThrow('Unknown election entity-relation table')
  })

  it('enqueues entity-relation jobs with the relation table', async () => {
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
    })
  })
})

describe('election enqueue call options', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recomputes a post election at the requested priority', async () => {
    const electionId = randomUUID()

    await enqueueBulkUpdatePostElectionVoteStats([electionId], 41)

    const jobs = await voteAggregation.searchJobs({
      name: VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
      data: { electionId },
    })
    onTestFinished(async () => {
      await Promise.all(jobs.map(job => job.remove()))
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toEqual({ electionId, orderingKey: 'post' })
    expect(jobs[0]?.opts.priority).toBe(41)
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
