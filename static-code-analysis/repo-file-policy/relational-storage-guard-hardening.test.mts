import { describe, expect, it } from 'vitest'
import type { SchemaSnapshot, SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import { checkRelationalStorage } from './relational-storage-guard.mts'

import { emptySchemaSnapshot, plainSnapshotTable } from './schema-snapshot-test-fixtures.mts'

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

function foreignKey(columnName: string): SchemaTableSnapshot['foreignKeys'][string] {
  return {
    columns: [columnName],
    definition: `FOREIGN KEY (${columnName}) REFERENCES owners (id)`,
    referencedTable: 'owners',
    referencedColumns: ['id'],
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

describe('relational storage guard hardening', () => {
  it.each([
    'CHECK ((num_nonnulls(topic_id, rss_feed_id, community_id) >= 1))',
    'CHECK ((num_nonnulls(community_id, topic_id, rss_feed_id) = 1))',
    'CHECK ((num_nonnulls(topic_id, rss_feed_id) = 1))',
    'CHECK ((num_nonnulls(topic_id, rss_feed_id, community_id) = 1 AND true))',
  ])('rejects a generated alias whose one-target check is not exact: %s', definition => {
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
      definition
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual(
      expect.arrayContaining([expect.stringContaining('curated_aside_items.entity_id')]),
    )
  })

  it('rejects unresolved domain types before JSON, UUID-array, and relation classification', () => {
    const value = snapshot('new_records', {
      facts: column('document_json'),
      owner_id: column('owner_uuid'),
      topic_ids: column('uuid_list'),
    })
    const errors = checkRelationalStorage(value, { enforceCatalogFreshness: false })
    expect(errors).toEqual([
      expect.stringContaining('new_records.facts: domain-backed type document_json'),
      expect.stringContaining('new_records.owner_id: domain-backed type owner_uuid'),
      expect.stringContaining('new_records.topic_ids: domain-backed type uuid_list'),
    ])
    expect(errors.join('\n')).not.toContain('JSON storage')
    expect(errors.join('\n')).not.toContain('UUID array')
    expect(errors.join('\n')).not.toContain('UUID reference')
  })

  it('does not treat a known enum column as a domain', () => {
    const value = snapshot('new_records', { kind: column('post_types') })
    value.enums = { post_types: { values: ['article'] } }
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual([])
  })

  it('requires a target FK when a shared primary key is not independently generated', () => {
    const value = snapshot('user_metrics', { id: column('uuid') })
    value.tables.user_metrics.primaryKey = {
      columns: ['id'],
      definition: 'PRIMARY KEY (id)',
    }
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual(
      expect.arrayContaining([expect.stringContaining('user_metrics.id')]),
    )
    value.tables.user_metrics.foreignKeys.user_metrics_id_fkey = foreignKey('id')
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual([])
  })

  it('accepts an independently generated primary key and a reviewed own identity', () => {
    const generated = snapshot('posts', { id: column('uuid') })
    generated.tables.posts.columns.id.defaultExpression = 'uuidv7()'
    generated.tables.posts.primaryKey = { columns: ['id'], definition: 'PRIMARY KEY (id)' }
    const ownIdentity = snapshot('user_sessions', { id: column('uuid') })
    ownIdentity.tables.user_sessions.primaryKey = {
      columns: ['id'],
      definition: 'PRIMARY KEY (id)',
    }
    expect(checkRelationalStorage(generated, { enforceCatalogFreshness: false })).toEqual([])
    expect(checkRelationalStorage(ownIdentity, { enforceCatalogFreshness: false })).toEqual([])
  })

  it('drops the reviewed encoded-key token once the column is a UUID with a target FK', () => {
    const value = snapshot('user_deletion_external_works', { work_key: column('uuid') })
    value.tables.user_deletion_external_works.foreignKeys.work_fk = foreignKey('work_key')
    const errors = checkRelationalStorage(value)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'user_deletion_external_works.work_key: stale token, cursor or protocol identifier catalog entry',
        ),
      ]),
    )
    expect(errors.join('\n')).not.toContain('user_deletion_external_works.work_key: encoded')
  })

  it('still treats a text work_key as encoded and a UUID work_key without an FK as dangling', () => {
    const encoded = snapshot('new_records', { work_key: column('text') })
    expect(checkRelationalStorage(encoded, { enforceCatalogFreshness: false })).toEqual(
      expect.arrayContaining([expect.stringContaining('new_records.work_key: encoded')]),
    )
    const dangling = snapshot('new_records', { work_key: column('uuid') })
    const danglingErrors = checkRelationalStorage(dangling, { enforceCatalogFreshness: false })
    expect(danglingErrors).toEqual(
      expect.arrayContaining([expect.stringContaining('new_records.work_key: UUID reference')]),
    )
    expect(danglingErrors.join('\n')).not.toContain('encoded entity reference')
  })
})
