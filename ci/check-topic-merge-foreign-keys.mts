import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { SchemaSnapshot } from 'vouchington-tooling/pg-schema-snapshot'

import { derivedReferences } from '../backend/services/topics/merge-derived-references.mts'
import {
  TOPIC_MERGE_REFERENCE_GROUPS,
  TOPIC_MERGE_SUBTYPE_TABLES,
} from '../backend/services/topics/merge-reference-inventory.mts'
import {
  collisionReferences,
  plainReferences,
} from '../backend/services/topics/merge-references.mts'
import { relationReferences } from '../backend/services/topics/merge-relations.mts'
import { subtypeReferences } from '../backend/services/topics/merge-subtypes.mts'

// Shipped topic-merge foreign-key policy for the static backend gate. Not a Vitest root.
const schemaPath = fileURLToPath(
  new URL('../backend/data-stores/psql/schema-snapshot/schema.json', import.meta.url),
)

const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as SchemaSnapshot
const failures = topicMergeForeignKeyFailures(schema)
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
process.exit(0)

function topicMergeForeignKeyFailures(schema: SchemaSnapshot): string[] {
  const failures: string[] = []
  const targets = new Set<string>(['topics', ...TOPIC_MERGE_SUBTYPE_TABLES])
  const foreignKeys = Object.entries(schema.tables).flatMap(([table, definition]) =>
    Object.values(definition.foreignKeys).flatMap(foreignKey =>
      targets.has(foreignKey.referencedTable)
        ? foreignKey.columns.map(column => `${table}.${column}`)
        : [],
    ),
  )
  const grouped = Object.keys(TOPIC_MERGE_REFERENCE_GROUPS).toSorted()
  const actual = foreignKeys.toSorted()
  if (!sameList(grouped, actual)) {
    failures.push(
      [
        'topic merge groups do not match topic foreign keys',
        `only in groups: ${absentFrom(grouped, actual).join(', ') || '(none)'}`,
        `only in schema: ${absentFrom(actual, grouped).join(', ') || '(none)'}`,
      ].join('\n'),
    )
  }

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
    ['classifier_candidates.topic_id', 'configuration'],
  ])
  const activeGroups: string[] = []
  for (const [reference, group] of Object.entries(TOPIC_MERGE_REFERENCE_GROUPS)) {
    if (group === 'history' || group === 'alias') continue
    activeGroups.push(reference)
    if (executed.get(reference) !== group) {
      failures.push(`${reference}: group ${group} is not executed as ${executed.get(reference)}`)
    }
  }
  const executedKeys = [...executed.keys()].toSorted()
  activeGroups.sort()
  if (!sameList(executedKeys, activeGroups)) {
    failures.push(
      [
        'executed topic merge paths do not match active groups',
        `only executed: ${absentFrom(executedKeys, activeGroups).join(', ') || '(none)'}`,
        `only grouped: ${absentFrom(activeGroups, executedKeys).join(', ') || '(none)'}`,
      ].join('\n'),
    )
  }
  return failures
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function absentFrom(items: readonly string[], other: readonly string[]): string[] {
  const seen = new Set(other)
  return [...new Set(items.filter(item => !seen.has(item)))]
}
