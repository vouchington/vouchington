import { describe, expect, it } from 'vitest'
import { capturePostShareSeedStatements } from '@voucha/test-helpers/explain-post-share-seed-capture'
import { withNextPostgresConnectFailure } from '@voucha/test-helpers/postgres-connect-failure'
import { seedPostFeedShares } from './post-feed-shares.mts'

describe('post feed share EXPLAIN fixtures', () => {
  it('deduplicates repeated deliveries into the declared sparse and dense target counts', async () => {
    const statements = await capturePostShareSeedStatements()
    expect(statements).toHaveLength(3)
    expect(statements[0]?.text).toContain('INSERT INTO post_feed_shares')
    expect(statements[1]?.text).toContain('INSERT INTO post_feed_shares')
    expect(statements[2]?.text).toContain('INSERT INTO relation__user__follow__user')
    const sparse = statements[0]!.values
    const dense = statements[1]!.values
    expect(sparse[0]).toBe('019e0000-0100-7000-8000-000000000000')
    expect(dense[0]).toBe('019e0000-0100-7000-8000-000000000001')
    expect(sparse[1]).toBe('019e0000-0100-7000-8000-000000000002')
    expect(dense[1]).toBe('019e0000-0100-7000-8000-000000000002')
    expect(statements[2]!.values).toEqual([
      '019e0000-0100-7000-8000-000000004e1f',
      '019e0000-0100-7000-8000-000000000002',
    ])
    const sparseIds = sparse[2] as string[]
    const sparsePosts = sparse[3] as string[]
    const denseIds = dense[2] as string[]
    const densePosts = dense[3] as string[]
    expect(sparseIds).toHaveLength(64)
    expect(new Set(sparsePosts).size).toBe(8)
    expect(new Set(sparseIds).size).toBe(64)
    expect(sparseIds.every(id => id.replaceAll('-', '').at(12) === '7')).toBe(true)
    expect(denseIds).toHaveLength(4000)
    expect(new Set(densePosts).size).toBe(1000)
    expect(new Set(denseIds).size).toBe(4000)
    expect(denseIds.every(id => id.replaceAll('-', '').at(12) === '7')).toBe(true)
  })

  it('propagates the write-pool connection failure before seeding', async () => {
    const failure = new Error('write-pool checkout failed')
    await withNextPostgresConnectFailure(failure, async () => {
      await expect(seedPostFeedShares()).rejects.toBe(failure)
    })
  })
})
