import { readFileSync } from 'node:fs'
import type { SchemaSnapshot } from 'vouchington-tooling/pg-schema-snapshot'
import { describe, expect, it } from 'vitest'
import { topicMergeForeignKeyFailures } from './check-topic-merge-foreign-keys.mts'

const schema = JSON.parse(
  readFileSync(
    new URL('../backend/data-stores/psql/schema-snapshot/schema.json', import.meta.url),
    'utf8',
  ),
) as SchemaSnapshot
const tableName = 'referral_program_link_counts'
const foreignKeyName = 'fk_referral_program_link_counts__topic'
const originalForeignKey = schema.tables[tableName]!.foreignKeys[foreignKeyName]!
const cascadeFailure =
  'referral_program_link_counts.topic_id: derived cascade must reference merge subtype referral_program_topics.topic_id ON DELETE CASCADE'

function withProjectionForeignKey(foreignKey: typeof originalForeignKey | null): SchemaSnapshot {
  return {
    ...schema,
    tables: {
      ...schema.tables,
      [tableName]: {
        ...schema.tables[tableName]!,
        foreignKeys: foreignKey ? { [foreignKeyName]: foreignKey } : {},
      },
    },
  }
}

describe('topic merge cascaded derived references', () => {
  it('accepts the checked-in subtype cascade', () => {
    expect(topicMergeForeignKeyFailures(schema)).toEqual([])
  })

  it('rejects a missing projection foreign key', () => {
    expect(topicMergeForeignKeyFailures(withProjectionForeignKey(null))).toContain(cascadeFailure)
  })

  it('rejects a non-cascading projection foreign key', () => {
    const changed = { ...originalForeignKey, onDelete: 'restrict' as const }
    expect(topicMergeForeignKeyFailures(withProjectionForeignKey(changed))).toContain(
      cascadeFailure,
    )
  })

  it('rejects a cascade to the wrong owner', () => {
    const changed = { ...originalForeignKey, referencedTable: 'topics', referencedColumns: ['id'] }
    expect(topicMergeForeignKeyFailures(withProjectionForeignKey(changed))).toContain(
      cascadeFailure,
    )
  })

  it('rejects a cascade from the wrong column', () => {
    const changed = { ...originalForeignKey, columns: ['other_id'] }
    expect(topicMergeForeignKeyFailures(withProjectionForeignKey(changed))).toContain(
      cascadeFailure,
    )
  })
})
