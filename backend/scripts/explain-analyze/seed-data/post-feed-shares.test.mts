import { describe, expect, it } from 'vitest'
import {
  POST_SHARE_DENSE_DELIVERIES_PER_TARGET,
  POST_SHARE_DENSE_TARGET_COUNT,
  POST_SHARE_SPARSE_DELIVERIES_PER_TARGET,
  POST_SHARE_SPARSE_TARGET_COUNT,
  postShareSeedRows,
} from './post-feed-shares.mts'

describe('post feed share EXPLAIN fixtures', () => {
  it('deduplicates repeated deliveries into the declared sparse and dense target counts', () => {
    for (const [recipient, targetCount, repeats] of [
      [0, POST_SHARE_SPARSE_TARGET_COUNT, POST_SHARE_SPARSE_DELIVERIES_PER_TARGET],
      [1, POST_SHARE_DENSE_TARGET_COUNT, POST_SHARE_DENSE_DELIVERIES_PER_TARGET],
    ] as const) {
      const rows = postShareSeedRows(recipient, targetCount, repeats)
      expect(rows).toHaveLength(targetCount * repeats)
      expect(new Set(rows.map(row => row.postId)).size).toBe(targetCount)
      expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
      expect(rows.every(row => row.id.replaceAll('-', '').at(12) === '7')).toBe(true)
    }
  })
})
