import { describe, expect, it } from 'vitest'
import { refreshEntityRelationVoteStatsWithDependencies } from './refresh-stats.mts'
import { createEntityRelationElectionTarget } from './target.mts'

describe('refreshEntityRelationVoteStatsFromPrimaryWithFallback', () => {
  const target = createEntityRelationElectionTarget('relation-1', 'relation__user__category__topic')

  it('passes the complete entity-relation target through primary refresh and fallback enqueue', async () => {
    const enqueued: (typeof target)[][] = []

    await refreshEntityRelationVoteStatsWithDependencies(target, {
      refreshFromPrimary: async () => {
        throw new Error('primary unavailable')
      },
      enqueueReconciliation: async targets => {
        enqueued.push(targets)
      },
    })

    expect(enqueued).toEqual([[target]])
  })

  it('does not enqueue when the primary refresh succeeds', async () => {
    let enqueueCalls = 0

    await expect(
      refreshEntityRelationVoteStatsWithDependencies(target, {
        refreshFromPrimary: async () => undefined,
        enqueueReconciliation: async () => {
          enqueueCalls++
        },
      }),
    ).resolves.toBeUndefined()
    expect(enqueueCalls).toBe(0)
  })

  it('resolves after a failed primary refresh is durably enqueued', async () => {
    const enqueued: (typeof target)[][] = []

    await expect(
      refreshEntityRelationVoteStatsWithDependencies(target, {
        refreshFromPrimary: async () => {
          throw new Error('primary unavailable')
        },
        enqueueReconciliation: async ids => {
          enqueued.push(ids)
        },
      }),
    ).resolves.toBeUndefined()
    expect(enqueued).toEqual([[target]])
  })

  it('throws only when the primary refresh and fallback enqueue both fail', async () => {
    const enqueueError = new Error('queue unavailable')

    await expect(
      refreshEntityRelationVoteStatsWithDependencies(target, {
        refreshFromPrimary: async () => {
          throw new Error('primary unavailable')
        },
        enqueueReconciliation: async () => {
          throw enqueueError
        },
      }),
    ).rejects.toMatchObject({ cause: enqueueError })
  })

  it('describes non-Error primary failures when fallback enqueue also fails', async () => {
    await expect(
      refreshEntityRelationVoteStatsWithDependencies(target, {
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Combined failure formatting preserves primitive primary reasons.
        refreshFromPrimary: async () => Promise.reject('primary unavailable'),
        enqueueReconciliation: async () => Promise.reject(new Error('queue unavailable')),
      }),
    ).rejects.toThrow('Primary entity-relation vote refresh failed (primary unavailable)')
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

  it('requires a whitelisted relation table without database lookup', () => {
    expect(() => createEntityRelationElectionTarget('relation-1', undefined)).toThrow(
      'Unknown election entity-relation table',
    )
  })
})
