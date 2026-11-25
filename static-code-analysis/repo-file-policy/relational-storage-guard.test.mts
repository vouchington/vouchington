import { describe, expect, it } from 'vitest'
import type { SchemaSnapshot, SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { checkRelationalStorage } from 'vouchington-tooling/relational-storage'

import { RELATIONAL_STORAGE_CATALOG } from './relational-storage-catalog.mts'
import { SCHEMA_SNAPSHOT_PATH } from './schema-snapshot-loader.mts'
import { emptySchemaSnapshot, plainSnapshotTable } from './schema-snapshot-test-fixtures.mts'
import { setupRepoFilePolicyTest } from '../test-helpers/repo-file-policy-fixtures.mts'

function column(type: string, generatedExpression: string | null = null) {
  return {
    type,
    nullable: true,
    defaultExpression: null,
    generatedExpression,
    identity: null,
    generated: generatedExpression ? 'virtual' : null,
    collation: null,
    comment: null,
    ordinalPosition: 1,
  } as const
}

function foreignKey(
  columnName: string,
  referencedTable = 'owners',
  referencedColumn = 'id',
): SchemaTableSnapshot['foreignKeys'][string] {
  return {
    columns: [columnName],
    definition: `FOREIGN KEY (${columnName}) REFERENCES ${referencedTable} (${referencedColumn})`,
    referencedTable,
    referencedColumns: [referencedColumn],
    onUpdate: 'no action',
    onDelete: 'restrict',
    validated: true,
  }
}

function snapshot(
  tableName: string,
  columns: Record<string, ReturnType<typeof column>>,
): SchemaSnapshot {
  const table = { ...plainSnapshotTable(), columns }
  return emptySchemaSnapshot({
    [tableName]: table,
  }) as SchemaSnapshot
}

const noFreshness = {
  snapshotPath: SCHEMA_SNAPSHOT_PATH,
  catalog: RELATIONAL_STORAGE_CATALOG,
  enforceCatalogFreshness: false,
}

const withFreshness = {
  snapshotPath: SCHEMA_SNAPSHOT_PATH,
  catalog: RELATIONAL_STORAGE_CATALOG,
}

describe('relational storage catalog wiring', () => {
  it('accepts the reviewed generated FK alias on curated_aside_items.entity_id', () => {
    const value = snapshot('curated_aside_items', {
      topic_id: column('uuid'),
      rss_feed_id: column('uuid'),
      community_id: column('uuid'),
      entity_id: column('uuid', 'COALESCE(topic_id, rss_feed_id, community_id)'),
    })
    for (const name of ['topic_id', 'rss_feed_id', 'community_id'] as const) {
      value.tables.curated_aside_items.foreignKeys[`${name}_fk`] = foreignKey(name)
    }
    value.tables.curated_aside_items.checkConstraints.chk_curated_aside_items__one_target =
      'CHECK ((num_nonnulls(topic_id, rss_feed_id, community_id) = 1))'
    expect(checkRelationalStorage(value, noFreshness)).toEqual([])
  })

  it('accepts the reviewed generated self-root alias on urls.canonical_root_id', () => {
    const value = snapshot('urls', {
      id: column('uuid'),
      canonical_url_id: column('uuid'),
      canonical_root_id: column(
        'uuid',
        'CASE WHEN (canonical_url_id IS NULL) THEN id ELSE NULL::uuid END',
      ),
    })
    value.tables.urls.primaryKey = { columns: ['id'], definition: 'PRIMARY KEY (id)' }
    value.tables.urls.columns.id.defaultExpression = 'uuidv7()'
    value.tables.urls.foreignKeys.urls_canonical_url_id_fkey = foreignKey(
      'canonical_url_id',
      'urls',
      'canonical_root_id',
    )
    expect(checkRelationalStorage(value, noFreshness)).toEqual([])
  })

  it('rejects the retired copyright placement key without flagging unrelated display keys', () => {
    expect(
      checkRelationalStorage(
        snapshot('copyright_notice_targets', { placement_key: column('text') }),
        noFreshness,
      ),
    ).toEqual([expect.stringContaining('copyright_notice_targets.placement_key')])
    expect(
      checkRelationalStorage(
        snapshot('display_cards', { placement_key: column('text') }),
        noFreshness,
      ),
    ).toEqual([])
  })

  it('flags stale catalog entries and accepts exact reviewed opaque JSON', () => {
    const value = snapshot('stripe_events', { payload: column('jsonb') })
    expect(checkRelationalStorage(value, noFreshness)).toEqual([])
    expect(checkRelationalStorage(value, withFreshness)).toEqual(
      expect.arrayContaining([expect.stringContaining('stale')]),
    )
  })
})

describe('repo-file-policy synthetic schema integration', () => {
  const fixture = setupRepoFilePolicyTest()

  it('accepts an injected JSON document and rejects a new UUID array', async () => {
    const repo = await fixture.makeRepo()
    await expect(fixture.run(repo)).resolves.toEqual({ stdout: 'All checks passed.' })
    fixture.setSnapshotTable(repo, 'new_records', {
      ...plainSnapshotTable(),
      columns: { facts: column('jsonb') },
    })
    await expect(fixture.run(repo)).resolves.toEqual({ stdout: 'All checks passed.' })
    fixture.setSnapshotTable(repo, 'new_records', {
      ...plainSnapshotTable(),
      columns: { topic_ids: column('uuid[]') },
    })
    await expect(fixture.run(repo)).rejects.toMatchObject({
      stdout: expect.stringContaining('new_records.topic_ids'),
    })
  })
})
