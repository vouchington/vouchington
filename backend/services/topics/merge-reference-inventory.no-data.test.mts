import { readFileSync } from 'node:fs'
import type { SchemaSnapshot } from 'vouchington-tooling/pg-schema-snapshot'
import { describe, expect, it } from 'vitest'
import {
  TOPIC_MERGE_REFERENCE_GROUPS,
  TOPIC_MERGE_SUBTYPE_TABLES,
} from './merge-reference-inventory.mts'
import { plainReferences, collisionReferences } from './merge-references.mts'
import { subtypeReferences } from './merge-subtypes.mts'
import { derivedReferences } from './merge-derived.mts'
import { relationReferences } from './merge-relations.mts'

describe('topic merge foreign-key inventory', () => {
  it('assigns every topic and subtype foreign key to an executed merge group or retained audit policy', () => {
    const schema = JSON.parse(
      readFileSync(
        new URL('../../data-stores/psql/schema-snapshot/schema.json', import.meta.url),
        'utf8',
      ),
    ) as SchemaSnapshot
    const targets = new Set<string>(['topics', ...TOPIC_MERGE_SUBTYPE_TABLES])
    const foreignKeys = Object.entries(schema.tables).flatMap(([table, definition]) =>
      Object.values(definition.foreignKeys).flatMap(foreignKey =>
        targets.has(foreignKey.referencedTable)
          ? foreignKey.columns.map(column => `${table}.${column}`)
          : [],
      ),
    )
    expect(Object.keys(TOPIC_MERGE_REFERENCE_GROUPS).toSorted()).toEqual(foreignKeys.toSorted())
    const executed = new Map<string, string>([
      ...plainReferences.flatMap(({ table, columns }) =>
        columns.map(column => [`${table}.${column}`, 'references'] as const),
      ),
      ...collisionReferences.flatMap(({ table, columns }) =>
        columns.map(column => [`${table}.${column}`, 'collisions'] as const),
      ),
      ...Object.entries(relationReferences).flatMap(([table, columns]) =>
        columns.map(column => [`${table}.${column}`, 'collisions'] as const),
      ),
      ...subtypeReferences.flatMap(({ table, columns }) =>
        columns.map(column => [`${table}.${column}`, 'subtype'] as const),
      ),
      ...TOPIC_MERGE_SUBTYPE_TABLES.map(table => [`${table}.topic_id`, 'subtype'] as const),
      ['rewards_program_status_topics.lifetime_version_id', 'subtype'],
      ...derivedReferences.map(([table, column]) => [`${table}.${column}`, 'derived'] as const),
    ])
    for (const [reference, group] of Object.entries(TOPIC_MERGE_REFERENCE_GROUPS)) {
      if (group === 'history' || group === 'alias') continue
      expect({ reference, group: executed.get(reference) }).toEqual({ reference, group })
    }
    expect([...executed.keys()].toSorted()).toEqual(
      Object.entries(TOPIC_MERGE_REFERENCE_GROUPS)
        .filter(([, group]) => group !== 'history' && group !== 'alias')
        .map(([reference]) => reference)
        .toSorted(),
    )
  })
})
