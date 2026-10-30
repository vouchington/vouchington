import { describe, expect, it } from 'vitest'
import { captureSeedTransaction } from '@voucha/test-helpers/data-stores/psql/capture-seed-transaction'
import {
  POST_SHARE_DENSE_TARGET_COUNT,
  POST_SHARE_SPARSE_TARGET_COUNT,
  seedPostFeedShares,
} from './post-feed-shares.mts'

describe('post feed share EXPLAIN fixtures', () => {
  it('deduplicates repeated deliveries into the declared sparse and dense target counts', async () => {
    const captured = captureSeedTransaction()
    try {
      await seedPostFeedShares()
      const shares = captured.calls.filter(call => call.text.includes('post_feed_shares'))
      expect(shares).toHaveLength(2)
      const groups = [
        [shares[0], POST_SHARE_SPARSE_TARGET_COUNT, 8],
        [shares[1], POST_SHARE_DENSE_TARGET_COUNT, 4],
      ] as const
      for (const [call, targetCount, repeats] of groups) {
        const ids = call?.values[2] as string[]
        const postIds = call?.values[3] as string[]
        expect(ids).toHaveLength(targetCount * repeats)
        expect(new Set(postIds).size).toBe(targetCount)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.every(id => id.replaceAll('-', '').at(12) === '7')).toBe(true)
      }
    } finally {
      captured.restore()
    }
  })
})
