import { describe, expect, it } from 'vitest'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import { checkRelationalStorage } from './relational-storage-guard.mts'
import { emptySchemaSnapshot, plainSnapshotTable } from './schema-snapshot-test-fixtures.mts'
import { setupRepoFilePolicyTest } from './repo-file-policy-test-helpers.mts'
import { verifyEntityRelationVotePartitionForeignKeys } from './partition-foreign-key-proof.mts'
import createEntityRelationsSql from '../../backend/data-stores/psql/config-driven/0000-00-01-entity-relations.mts'

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

function snapshot(
  tableName: string,
  columns: Record<string, ReturnType<typeof column>>,
): SchemaSnapshot {
  const table = { ...plainSnapshotTable(), columns }
  return emptySchemaSnapshot({
    [tableName]: table,
  }) as SchemaSnapshot
}

describe('relational storage guard', () => {
  it('rejects new business JSON, UUID arrays and reference-like UUIDs without FKs', () => {
    const result = checkRelationalStorage(
      snapshot('new_records', {
        facts: column('jsonb'),
        topic_ids: column('uuid[]'),
        topic_id: column('uuid'),
        target_uuid: column('uuid'),
      }),
      { enforceCatalogFreshness: false },
    )
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringContaining('new_records.facts'),
        expect.stringContaining('new_records.topic_ids'),
        expect.stringContaining('new_records.topic_id'),
        expect.stringContaining('new_records.target_uuid'),
      ]),
    )
  })

  it('rejects primary and unique UUID references without a target FK', () => {
    const value = snapshot('child_records', { owner_id: column('uuid') })
    value.tables.child_records.primaryKey = {
      columns: ['owner_id'],
      definition: 'PRIMARY KEY (owner_id)',
    }
    value.tables.child_records.uniqueConstraints.owner_unique = {
      columns: ['owner_id'],
      definition: 'UNIQUE (owner_id)',
    }
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual(
      expect.arrayContaining([expect.stringContaining('child_records.owner_id')]),
    )
  })

  it('accepts a concrete composite FK', () => {
    const value = snapshot('child_records', {
      owner_id: column('uuid'),
      owner_month: column('date'),
    })
    value.tables.child_records.foreignKeys.owner_fk = {
      columns: ['owner_id', 'owner_month'],
      definition: 'FOREIGN KEY (owner_id, owner_month) REFERENCES owners (id, month)',
      referencedTable: 'owners',
      referencedColumns: ['id', 'month'],
      onUpdate: 'no action',
      onDelete: 'restrict',
      validated: true,
    }
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual([])
  })

  it('accepts the exact reviewed generated alias and rejects unrelated expressions', () => {
    const value = snapshot('curated_aside_items', {
      topic_id: column('uuid'),
      rss_feed_id: column('uuid'),
      community_id: column('uuid'),
      entity_id: column('uuid', 'COALESCE(topic_id, rss_feed_id, community_id)'),
    })
    for (const name of ['topic_id', 'rss_feed_id', 'community_id'] as const) {
      value.tables.curated_aside_items.foreignKeys[`${name}_fk`] = {
        columns: [name],
        definition: `FOREIGN KEY (${name}) REFERENCES owners (id)`,
        referencedTable: 'owners',
        referencedColumns: ['id'],
        onUpdate: 'no action',
        onDelete: 'restrict',
        validated: true,
      }
    }
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual([])
    value.tables.curated_aside_items.columns.entity_id.generatedExpression =
      'COALESCE(gen_random_uuid(), topic_id)'
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual(
      expect.arrayContaining([expect.stringContaining('curated_aside_items.entity_id')]),
    )
  })

  it('rejects a type discriminator paired with a UUID or encoded target key', () => {
    const value = snapshot('new_records', {
      target_kind: column('text'),
      target_id: column('uuid'),
      work_key: column('text'),
    })
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('new_records.target_id'),
        expect.stringContaining('new_records.work_key'),
      ]),
    )
  })

  it('flags stale catalog entries and accepts exact reviewed opaque JSON', () => {
    const value = snapshot('stripe_events', { payload: column('jsonb') })
    const currentErrors = checkRelationalStorage(value, { enforceCatalogFreshness: false })
    expect(currentErrors).toEqual([])
    const staleErrors = checkRelationalStorage(value)
    expect(staleErrors).toEqual(expect.arrayContaining([expect.stringContaining('stale')]))
  })

  it('accepts only the proven concrete FK on every generated LIST partition', () => {
    const sql = createEntityRelationsSql()
    expect(verifyEntityRelationVotePartitionForeignKeys(sql)).toEqual([])
    expect(
      verifyEntityRelationVotePartitionForeignKeys(
        sql.replace(
          'FOREIGN KEY (subject_id, entity_relation_id)',
          'UNIQUE (subject_id, entity_relation_id)',
        ),
      ),
    ).not.toEqual([])
    const value = snapshot('entity_relation_votes', {
      subject_id: column('uuid'),
      entity_relation_id: column('uuid'),
    })
    value.tables.entity_relation_votes.relationKind = 'partitioned table'
    const verifiedPartitionForeignKeys = new Set([
      'entity_relation_votes.subject_id',
      'entity_relation_votes.entity_relation_id',
    ])
    expect(
      checkRelationalStorage(value, {
        enforceCatalogFreshness: false,
        verifiedPartitionForeignKeys,
      }),
    ).toEqual([])
    expect(checkRelationalStorage(value, { enforceCatalogFreshness: false })).not.toEqual([])
  })
})

describe('repo-file-policy synthetic schema integration', () => {
  const fixture = setupRepoFilePolicyTest()

  it('accepts an injected empty schema while rejecting a new JSON column', async () => {
    const repo = await fixture.makeRepo()
    await expect(fixture.run(repo)).resolves.toEqual({ stdout: 'All checks passed.' })
    fixture.setSnapshotTable(repo, 'new_records', {
      ...plainSnapshotTable(),
      columns: { facts: column('jsonb') },
    })
    await expect(fixture.run(repo)).rejects.toMatchObject({
      stdout: expect.stringContaining('new_records.facts'),
    })
  })
})
