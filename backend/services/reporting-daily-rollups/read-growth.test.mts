import { describe, expect, it } from 'vitest'
import { createTestUser, hardDeleteTestPost, insertTestPost } from '@voucha/test-helpers'
import { getMinUuidv7ForDate } from '@modules/utils'
import { countGrowthDauMau } from './read-growth.mts'

describe('countGrowthDauMau', () => {
  it('counts a DAU author in MAU when yesterday has no rollup row for them', async () => {
    const author = await createTestUser()
    // A synthetic far-future day isolates the window; no rollup exists for it.
    const now = new Date(Date.UTC(2200, 0, 1 + crypto.getRandomValues(new Uint8Array(1))[0]!, 6))
    const postedAt = new Date(now.getTime() - 20 * 3_600_000)
    const postId = await insertTestPost({
      id: getMinUuidv7ForDate(postedAt),
      title: 'Yesterday author without rollup',
      slug: `dau-mau-${crypto.randomUUID()}`,
      markdown: 'Raw post inside the DAU window, absent from the rollup.',
      createdById: author.id,
      createdAt: postedAt,
    })
    try {
      const counts = await countGrowthDauMau(
        new Date(now.getTime() - 86_400_000),
        new Date(now.getTime() - 30 * 86_400_000),
        now,
      )
      expect(counts).toEqual({ dau: 1, mau: 1 })
    } finally {
      await hardDeleteTestPost(postId)
    }
  })
})
