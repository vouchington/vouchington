import { describe, expect, it } from 'vitest'
import { setupRepoFilePolicyTest } from '../../test-helpers/repo-file-policy-fixtures.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('rejects stale RSS feed item partition comments', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/services/rss-feed-items/get.mts',
      '// Queries across all 8 hash partitions via idx_rss_feed_items__id index.\n',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('rss_feed_items is not hash-partitioned'),
    })
  })

  it('rejects HASH partition declarations', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/9999-partitions.sql',
      'CREATE TABLE audit_events (id UUID DEFAULT uuidv7()) PARTITION BY HASH (id);',
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('HASH partitioning is not allowed'),
    })
  })
})
