import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { getVoteWeightFamilyCommitBoundary } from './dispatch-commit-boundary.mts'

describe('getVoteWeightFamilyCommitBoundary', () => {
  it('stays strictly before an open writer transaction even when the application clock is ahead', async () => {
    await using transaction = await beginTransaction()
    const { rows } = await transaction<{ at: string }>(
      '/* familyCommitBoundaryTest */ SELECT CURRENT_TIMESTAMP::text AS at',
    )
    const startedAt = rows[0]!.at
    const boundary = await getVoteWeightFamilyCommitBoundary(new Date('2099-01-01T00:00:00Z'))
    const { rows: comparisons } = await transaction<{ before: boolean }>(
      '/* familyCommitBoundaryTest */ SELECT $1::timestamptz < $2::timestamptz AS before',
      [boundary, startedAt],
    )
    expect(comparisons[0]?.before).toBe(true)
  })

  it('retains an earlier caller boundary', async () => {
    const now = new Date('2000-01-01T00:00:00Z')
    const boundary = await getVoteWeightFamilyCommitBoundary(now)
    expect(new Date(boundary).getTime()).toBeLessThanOrEqual(now.getTime())
  })
})
