import { describe, expect, it } from 'vitest'
import {
  POST_SHARE_DENSE_TARGET_COUNT,
  POST_SHARE_SPARSE_TARGET_COUNT,
  postShareDeliveryGroups,
} from './post-feed-shares.mts'

describe('post feed share EXPLAIN fixtures', () => {
  it('deduplicates repeated deliveries into the declared sparse and dense target counts', () => {
    const [sparse, dense] = postShareDeliveryGroups()
    for (const [rows, targetCount, repeats] of [
      [sparse, POST_SHARE_SPARSE_TARGET_COUNT, 8],
      [dense, POST_SHARE_DENSE_TARGET_COUNT, 4],
    ] as const) {
      expect(rows).toHaveLength(targetCount * repeats)
      expect(new Set(rows.map(row => row.postId)).size).toBe(targetCount)
      expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
      expect(rows.every(row => row.id.replaceAll('-', '').at(12) === '7')).toBe(true)
    }
  })
})
