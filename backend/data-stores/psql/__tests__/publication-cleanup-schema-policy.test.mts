import { describe, expect, it } from 'vitest'
import { isIgnoredForNameInflection } from '../../../test-helpers/data-stores/psql/schema-static-analysis/name-helpers.mts'
import { isAllowedUuidConventionViolation } from '../../../test-helpers/data-stores/psql/schema-static-analysis/conventions.mts'
import { readPublicationMigrationColumnOrders } from '../../../test-helpers/data-stores/psql/publication-migration-order.mts'

describe('publication cleanup schema policy', () => {
  it('declares fresh publication columns in committed snapshot ordinal order', async () => {
    const tables = await readPublicationMigrationColumnOrders()
    expect(tables.map(table => table.table)).toEqual([
      'post_publication_identity_protocol',
      'post_publication_identity_cleanup_progress',
      'post_publication_identity_snapshots',
      'post_publication_identity_snapshot_keys',
    ])
    for (const table of tables) expect(table.declared).toEqual(table.committed)
  })
  it('exempts only the checked singleton and its deletion-stable cursor', () => {
    expect(isIgnoredForNameInflection('post_publication_identity_cleanup_progress')).toBe(true)
    expect(isIgnoredForNameInflection('post_publication_identity_cleanup_attempt')).toBe(false)
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'post_publication_identity_cleanup_progress',
        column_name: 'cursor_snapshot_id',
        problem: 'uuid-column-without-key',
      }),
    ).toBe(true)
    expect(
      isAllowedUuidConventionViolation({
        table_name: 'post_publication_identity_cleanup_progress',
        column_name: 'snapshot_id',
        problem: 'uuid-column-without-key',
      }),
    ).toBe(false)
  })
})
