import { describe, expect, it } from 'vitest'
import { deleteTestPostVotesAcrossCompletedDays } from '@voucha/test-helpers/reporting-source-changes'

describe('reporting source change statement triggers', () => {
  it('records one deletion per completed UTC day for a multirow delete through the partitioned parent', async () => {
    const result = await deleteTestPostVotesAcrossCompletedDays()

    expect(result.deletedVoteCount).toBe(4)
    expect(result.storageRelations.length).toBeGreaterThan(0)
    expect(result.storageRelations.every(name => name.startsWith('post_votes__'))).toBe(true)
    expect(result.deletionCounts).toEqual(result.sourceDays.map(day => ({ day, count: 1 })))
  })
})
