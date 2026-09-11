import type { UpsertEntityTypes, EntityIdentifier } from './upsert-helpers.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

export function appendSingleEntityWhereClause(
  query: SQLStatement,
  entity: UpsertEntityTypes | EntityIdentifier,
  role: 'subject' | 'object',
): void {
  query.append(role === 'subject' ? sql`subject_id = ${entity.id}` : sql`object_id = ${entity.id}`)
}

export function appendManyEntitiesWhereClause(
  query: SQLStatement,
  entities: Array<UpsertEntityTypes | EntityIdentifier>,
  role: 'subject' | 'object',
): void {
  if (entities.length === 0) {
    query.append(sql`FALSE`)
    return
  }

  const ids = entities.map(entity => entity.id)
  query.append(role === 'subject' ? sql`subject_id = ANY(${ids})` : sql`object_id = ANY(${ids})`)
}
