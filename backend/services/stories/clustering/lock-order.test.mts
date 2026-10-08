import { reserveReciprocalStoryRuns } from '@voucha/test-helpers/story-clustering-lock-order'
import { describe, expect, it } from 'vitest'

describe('story clustering dispatcher lock order (real PG)', () => {
  it('reserves reciprocal standalone candidates concurrently without a lock cycle', async () => {
    const { results, candidates, itemIds } = await reserveReciprocalStoryRuns()
    expect(results.map(result => result.kind)).toEqual(['reserved', 'reserved'])
    expect(candidates).toEqual([[{ rssFeedItemId: itemIds[1] }], [{ rssFeedItemId: itemIds[0] }]])
  })
})
