import { describe, expect, it } from 'vitest'
import { withOpenVoteWeightWriterTransaction } from '@voucha/test-helpers/vote-weight-commit-boundary'
import { getVoteWeightFamilyCommitBoundary } from './dispatch-commit-boundary.mts'

describe('getVoteWeightFamilyCommitBoundary', () => {
  it('stays strictly before an open writer transaction even when the application clock is ahead', async () => {
    await withOpenVoteWeightWriterTransaction(async isBefore => {
      const boundary = await getVoteWeightFamilyCommitBoundary(new Date('2099-01-01T00:00:00Z'))
      expect(await isBefore(boundary)).toBe(true)
    })
  })

  it('retains an earlier caller boundary', async () => {
    const now = new Date('2000-01-01T00:00:00Z')
    const boundary = await getVoteWeightFamilyCommitBoundary(now)
    expect(new Date(boundary).getTime()).toBeLessThanOrEqual(now.getTime())
  })
})
