import { afterAll, describe, expect, it } from 'vitest'
import { readConstraints } from '@vouchington/postgres/pg-schema-snapshot'
import { onGracefulShutdown } from '../index.mts'
import { catalogQuery } from '../schema-snapshot/catalog-query.mts'
import {
  getChildOwnedPartitionCheckConstraintRows,
  getDerivedPartitionConstraintRows,
  getDirectPartitionChildForeignKeyRows,
} from '../../../test-helpers/data-stores/psql/schema-snapshot-constraints.mts'

describe('schema snapshot partition constraints', () => {
  afterAll(onGracefulShutdown)

  it('excludes PostgreSQL-derived partition constraints while retaining their logical parents', async () => {
    const [derivedRows, snapshotConstraints] = await Promise.all([
      getDerivedPartitionConstraintRows(),
      readConstraints(catalogQuery),
    ])

    expect(derivedRows).not.toEqual([])
    for (const { derived, parent } of derivedRows) {
      expect(snapshotConstraints).not.toEqual(
        expect.arrayContaining([expect.objectContaining(derived)]),
      )
      expect(snapshotConstraints).toEqual(expect.arrayContaining([expect.objectContaining(parent)]))
    }
  })

  it('excludes child-owned inherited CHECK constraints without parent links', async () => {
    const [childOwnedChecks, snapshotConstraints] = await Promise.all([
      getChildOwnedPartitionCheckConstraintRows(),
      readConstraints(catalogQuery),
    ])

    expect(childOwnedChecks).not.toEqual([])
    for (const childOwnedCheck of childOwnedChecks) {
      expect(snapshotConstraints).not.toEqual(
        expect.arrayContaining([expect.objectContaining(childOwnedCheck)]),
      )
    }
  })

  it('has no top-level foreign keys that reference physical partition children', async () => {
    const rows = await getDirectPartitionChildForeignKeyRows()

    expect(
      rows.map(
        row =>
          `${row.owner_table_name}.${row.constraint_name} -> ${row.target_child_table_name} (partition of ${row.target_parent_table_name})`,
      ),
    ).toEqual([])
  })
})
