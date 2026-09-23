import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { getDirectPartitionChildForeignKeyRows } from '../../../test-helpers/data-stores/psql/schema-partition-foreign-keys.mts'

describe('partition foreign keys', () => {
  afterAll(onGracefulShutdown)

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
