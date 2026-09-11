import { describe, expect, it } from 'vitest'
import {
  isSweepCandidate,
  nextPagingState,
  planRunDeletions,
  planSweepDeletions,
  shouldStopPaging,
  summarize,
  type ArtifactLike,
} from './cleanup-artifacts-plan.mts'

function artifact(overrides: Partial<ArtifactLike> = {}): ArtifactLike {
  return {
    id: 1,
    name: 'coverage-web',
    size_in_bytes: 100,
    expired: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('summarize', () => {
  it('sums count and bytes', () => {
    expect(summarize([artifact({ size_in_bytes: 10 }), artifact({ size_in_bytes: 20 })])).toEqual({
      deletedCount: 2,
      bytesFreed: 30,
    })
  })

  it('handles an empty list', () => {
    expect(summarize([])).toEqual({ deletedCount: 0, bytesFreed: 0 })
  })
})

describe('planRunDeletions', () => {
  it('keeps a non-expired delete-classified artifact', () => {
    expect(planRunDeletions([artifact({ name: 'coverage-web' })])).toHaveLength(1)
  })

  it('drops an expired artifact', () => {
    expect(planRunDeletions([artifact({ name: 'coverage-web', expired: true })])).toEqual([])
  })

  it('retains an unclassified artifact without aborting the plan', () => {
    expect(planRunDeletions([artifact({ name: 'artifact-from-an-older-policy' })])).toEqual([])
  })
})

describe('isSweepCandidate', () => {
  const cutoff = '2026-01-02T00:00:00Z'

  it('accepts an old, non-expired, delete-classified artifact', () => {
    expect(isSweepCandidate(artifact({ created_at: '2026-01-01T00:00:00Z' }), cutoff)).toBe(true)
  })

  it('rejects an artifact newer than the cutoff', () => {
    expect(isSweepCandidate(artifact({ created_at: '2026-01-03T00:00:00Z' }), cutoff)).toBe(false)
  })

  it('rejects an expired artifact', () => {
    expect(
      isSweepCandidate(artifact({ created_at: '2026-01-01T00:00:00Z', expired: true }), cutoff),
    ).toBe(false)
  })

  it('retains an unclassified artifact without aborting the sweep', () => {
    expect(
      isSweepCandidate(
        artifact({
          name: 'artifact-from-an-older-policy',
          created_at: '2026-01-01T00:00:00Z',
        }),
        cutoff,
      ),
    ).toBe(false)
  })
})

describe('shouldStopPaging / nextPagingState', () => {
  it('stops once the hard page cap is reached', () => {
    expect(shouldStopPaging([artifact()], { page: 150, consecutiveExpiredPages: 0 })).toBe(true)
  })

  it('stops on an empty page', () => {
    expect(shouldStopPaging([], { page: 1, consecutiveExpiredPages: 0 })).toBe(true)
  })

  it('stops after enough consecutive fully-expired pages', () => {
    expect(
      shouldStopPaging([artifact({ expired: true })], { page: 2, consecutiveExpiredPages: 5 }),
    ).toBe(true)
  })

  it('continues otherwise', () => {
    expect(shouldStopPaging([artifact()], { page: 2, consecutiveExpiredPages: 0 })).toBe(false)
  })

  it('increments the expired streak only when the whole page is expired', () => {
    const mixed = [artifact({ expired: true }), artifact({ expired: false })]
    expect(nextPagingState(mixed, { page: 1, consecutiveExpiredPages: 3 })).toEqual({
      page: 2,
      consecutiveExpiredPages: 0,
    })

    const allExpired = [artifact({ expired: true }), artifact({ expired: true })]
    expect(nextPagingState(allExpired, { page: 1, consecutiveExpiredPages: 3 })).toEqual({
      page: 2,
      consecutiveExpiredPages: 4,
    })
  })
})

describe('planSweepDeletions', () => {
  it('keeps candidates whose run succeeded or was cancelled', async () => {
    const candidates = [
      artifact({ id: 1, workflow_run: { id: 10 } }),
      artifact({ id: 2, workflow_run: { id: 20 } }),
      artifact({ id: 3, workflow_run: { id: 30 } }),
    ]
    const conclusions: Record<number, string | null> = {
      10: 'success',
      20: 'cancelled',
      30: 'failure',
    }

    const kept = await planSweepDeletions(candidates, async runId => conclusions[runId] ?? null)

    expect(kept.map(a => a.id)).toEqual([1, 2])
  })

  it('skips an artifact with no producing run id', async () => {
    const kept = await planSweepDeletions(
      [artifact({ workflow_run: undefined })],
      async () => 'success',
    )

    expect(kept).toEqual([])
  })
})
