import { it, expect, describe } from 'vitest'
import {
  buildElectionJobOptions,
  enqueueBulkUpdateEntityRelationElectionVoteStats,
} from './enqueues.mts'
import { ELECTIONS_DEFAULTS, ELECTIONS_ORDERING } from './config.mts'

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

  it.each(['post', 'entity_relation'] as const)(
    'passes through the %s ordering config',
    orderingKey => {
      const opts = buildElectionJobOptions('election-1', orderingKey)

      expect(opts.ordering).toEqual(ELECTIONS_ORDERING[orderingKey])
    },
  )

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
})
