import { describe, expect, it } from 'vitest'
import { rejectQuery } from '@voucha/test-helpers/injected-failures'
import {
  readTestCommunityActivityDigestCursor,
  withTestCommunityActivityDigestCursor,
} from '@voucha/test-helpers/community-activity-digest-dispatch'
import { advanceCommunityActivityDigestCursor } from './community-activity-digest-dispatch.mts'

describe('community activity digest cursor failure', () => {
  it('keeps a failed window available when the cursor write fails', async () => {
    const start = new Date('2400-01-06T00:00:00.000Z')
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
    await withTestCommunityActivityDigestCursor(start, async query => {
      const rejected = rejectQuery(
        query,
        statement => statement.includes('advanceCommunityActivityDigestCursor'),
        'injected cursor write failure',
      )
      await expect(
        advanceCommunityActivityDigestCursor(start, end, { query: rejected }),
      ).rejects.toThrow('injected cursor write failure')
      expect(await readTestCommunityActivityDigestCursor(query)).toEqual(start)
      expect(await advanceCommunityActivityDigestCursor(start, end, { query })).toBe(true)
    })
  })
})
