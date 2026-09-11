import { describe, expect, it } from 'vitest'

import {
  checkDocumentedPartitionTables,
  renderPartitionInventory,
} from '../partition-inventory-doc.mts'
import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy schema doc drift reverse checks', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('rejects partition docs that claim a phantom table is partitioned', async () => {
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
    await track(
      dir,
      'docs/overview/architecture/partitioning-strategy.md',
      [
        '`audit_events` is partitioned for retention.',
        '`landing_page_visits` is a RANGE-partitioned analytics table.',
        '`landing_page_item_clicks` has monthly partitions.',
        renderPartitionInventory(['audit_events']),
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'partitioned table landing_page_visits is documented but has no migration or registry-backed partition definition',
      ),
    })
  })

  it('allows partition claims with column references for migration-backed tables', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/9999-partitions.sql',
      [
        'CREATE TABLE IF NOT EXISTS audit_events (',
        '  id uuid PRIMARY KEY DEFAULT uuidv7(),',
        '  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL',
        ') PARTITION BY RANGE (id);',
      ].join('\n'),
    )
    await track(
      dir,
      'docs/overview/architecture/partitioning-strategy.md',
      [
        'RANGE-partition `audit_events` by `created_at`.',
        renderPartitionInventory(['audit_events']),
      ].join('\n'),
    )

    await expect(run(dir)).resolves.toMatchObject({ stdout: 'All checks passed.' })
  })

  it('rejects positive partition claims on lines that also mention unpartitioned tables', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/overview/architecture/partitioning-strategy.md',
      [
        'Unlike the unpartitioned inventory, `landing_page_visits` is RANGE-partitioned.',
        '`landing_page_item_clicks` is partitioned, but `users` is unpartitioned.',
        renderPartitionInventory([]),
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringMatching(
        /partitioned table landing_page_(item_clicks|visits) is documented but has no migration or registry-backed partition definition/,
      ),
    })
  })

  it('checks partition claims in markdown table rows outside the generated inventory', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'docs/overview/architecture/partition-pruning-hints.md',
      ['| Table | Strategy |', '| --- | --- |', '| `landing_page_visits` | RANGE |'].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'partitioned table landing_page_visits is documented but has no migration or registry-backed partition definition',
      ),
    })
  })

  it('ignores negated partition claims and common partition-key references', async () => {
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
    await track(
      dir,
      'docs/overview/architecture/partitioning-strategy.md',
      [
        '`landing_page_visits` is not hash partitioned.',
        'RANGE partition `audit_events` by `date` and `timestamp`.',
        renderPartitionInventory(['audit_events']),
      ].join('\n'),
    )

    await expect(run(dir)).resolves.toMatchObject({ stdout: 'All checks passed.' })
  })

  it('requires planned partition docs to include a roadmap reason', () => {
    const errors: string[] = []
    checkDocumentedPartitionTables(
      new Map([
        [
          'docs/overview/architecture/partitioning-strategy.md',
          '`landing_page_visits` has monthly partitions.',
        ],
      ]),
      new Set(),
      errors,
      { plannedPartitionDocTables: new Map([['landing_page_visits', '']]) },
    )

    expect(errors).toEqual([
      expect.stringContaining(
        'partitioned table landing_page_visits is documented but has no migration or registry-backed partition definition',
      ),
    ])
  })

  it('allows planned partition docs with a roadmap reason', () => {
    const errors: string[] = []
    checkDocumentedPartitionTables(
      new Map([
        [
          'docs/overview/architecture/partitioning-strategy.md',
          '`landing_page_visits` has monthly partitions.',
        ],
      ]),
      new Set(),
      errors,
      { plannedPartitionDocTables: new Map([['landing_page_visits', 'Roadmap Q3 2026']]) },
    )

    expect(errors).toEqual([])
  })
})
