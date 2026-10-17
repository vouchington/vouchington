import { describe, expect, it } from 'vitest'

import { renderPartitionInventory } from '../partition-inventory-doc.mts'
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

  it(
    'rejects partition docs missing migration-defined partitioned tables',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'backend/data-stores/psql/migrations/9999-partitions.sql',
        [
          'CREATE TABLE IF NOT EXISTS audit_events (',
          '  id uuid PRIMARY KEY DEFAULT uuidv7()',
          ') PARTITION BY RANGE (id);',
        ].join('\n'),
      )
      const noAudit = 'No audit inventory.\n'
      await track(dir, 'docs/overview/architecture/partition-pruning-hints.md', noAudit)
      await track(dir, 'docs/overview/architecture/partitioning-strategy.md', noAudit)

      await expect(run(dir)).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining('partitioned table audit_events is missing'),
      })
    },
  )

  it(
    'allows partition docs listing migration-defined partitioned tables',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'backend/data-stores/psql/migrations/9999-partitions.sql',
        [
          'CREATE TABLE IF NOT EXISTS audit_events (',
          '  id uuid PRIMARY KEY DEFAULT uuidv7()',
          ') PARTITION BY RANGE (id);',
        ].join('\n'),
      )
      await track(dir, 'docs/overview/architecture/partition-pruning-hints.md', '`audit_events`\n')
      await track(
        dir,
        'docs/overview/architecture/partitioning-strategy.md',
        `\`audit_events\`\n${renderPartitionInventory(['audit_events'])}\n`,
      )

      await expect(run(dir)).resolves.toMatchObject({
        stdout: 'All checks passed.',
      })
    },
  )

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

  it('rejects stale partition strategy inventory rows', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/9999-partitions.sql',
      'CREATE TABLE audit_events (id UUID DEFAULT uuidv7()) PARTITION BY RANGE (id);',
    )
    await track(
      dir,
      'docs/overview/architecture/partitioning-strategy.md',
      [
        '<!-- schema-growth-registry:start -->',
        '| `old_events` | RANGE |',
        '<!-- schema-growth-registry:end -->',
      ].join('\n'),
    )
    await track(dir, 'docs/overview/architecture/partition-pruning-hints.md', '`audit_events`\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('generated schema-growth inventory is stale'),
    })
  })
})
