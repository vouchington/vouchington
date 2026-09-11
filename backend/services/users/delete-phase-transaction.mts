import { assertWhitelistedSqlIdentifier, beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import sql from 'sql-template-strings'

async function lockUserDeletionPhase(query: TransactionQuery, userId: string): Promise<void> {
  await query(sql`/* processUserDeletionPhase:lockUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `)
  await lockAuthorPublicationLifecycle(query, userId)
}

export async function withUserDeletionTransaction<T>(
  userId: string,
  operation: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await lockUserDeletionPhase(query, userId)
  const result = await operation(query)
  await query.commit()
  return result
}

export async function deleteOwnedRows(
  query: TransactionQuery,
  table: string,
  allowedTables: ReadonlySet<string>,
  ownerColumn: 'subject_id' | 'user_id',
  entityKeyColumn: string,
  allowedEntityKeyColumns: ReadonlySet<string>,
  userId: string,
  batchSize: number,
): Promise<number> {
  const tableIdentifier = assertWhitelistedSqlIdentifier(table, allowedTables, 'userDeletionTable')
  const entityKeyIdentifier = assertWhitelistedSqlIdentifier(
    entityKeyColumn,
    allowedEntityKeyColumns,
    'userDeletionEntityKeyColumn',
  )
  const candidateStatement = sql`/* processUserDeletionOwnedRows:candidates */ SELECT `
  candidateStatement.append(ownerColumn)
  candidateStatement.append(sql` AS owner_id, `)
  candidateStatement.append(entityKeyIdentifier)
  candidateStatement.append(sql` AS entity_key, id FROM `)
  candidateStatement.append(tableIdentifier)
  candidateStatement.append(sql` WHERE `)
  candidateStatement.append(ownerColumn)
  candidateStatement.append(sql` = ${userId} ORDER BY `)
  candidateStatement.append(ownerColumn)
  candidateStatement.append(sql`, `)
  candidateStatement.append(entityKeyIdentifier)
  candidateStatement.append(sql`, id DESC LIMIT ${batchSize}`)
  const { rows: candidates } = await query<{
    owner_id: string
    entity_key: string
    id: string
  }>(candidateStatement)
  if (candidates.length === 0) return 0

  const deleteStatement = sql`/* processUserDeletionOwnedRows */ DELETE FROM `
  deleteStatement.append(tableIdentifier)
  deleteStatement.append(sql` owned_row USING (
    SELECT UNNEST(${candidates.map(candidate => candidate.owner_id)}::uuid[]) AS owner_id,
           UNNEST(${candidates.map(candidate => candidate.entity_key)}::uuid[]) AS entity_key,
           UNNEST(${candidates.map(candidate => candidate.id)}::uuid[]) AS id
  ) candidates
    WHERE owned_row.`)
  deleteStatement.append(ownerColumn)
  deleteStatement.append(sql` = candidates.owner_id AND owned_row.`)
  deleteStatement.append(entityKeyIdentifier)
  deleteStatement.append(sql` = candidates.entity_key AND owned_row.id = candidates.id`)
  await query(deleteStatement)
  return candidates.length
}

export async function deleteUserSubjectRelationRows(
  query: TransactionQuery,
  table: string,
  allowedTables: ReadonlySet<string>,
  userId: string,
  batchSize: number,
): Promise<number> {
  const tableIdentifier = assertWhitelistedSqlIdentifier(table, allowedTables, 'userDeletionTable')
  const candidateStatement = sql`/* processUserDeletionSubjectRelations:candidates */ SELECT subject_id, object_id FROM `
  candidateStatement.append(tableIdentifier)
  candidateStatement.append(sql` WHERE subject_id = ${userId}
    ORDER BY subject_id, object_id LIMIT ${batchSize}`)
  const { rows: candidates } = await query<{
    subject_id: string
    object_id: string
  }>(candidateStatement)
  if (candidates.length === 0) return 0

  const deleteStatement = sql`/* processUserDeletionSubjectRelations */ DELETE FROM `
  deleteStatement.append(tableIdentifier)
  deleteStatement.append(sql` relation USING (
    SELECT UNNEST(${candidates.map(candidate => candidate.subject_id)}::uuid[]) AS subject_id,
           UNNEST(${candidates.map(candidate => candidate.object_id)}::uuid[]) AS object_id
  ) candidates
    WHERE relation.subject_id = candidates.subject_id
      AND relation.object_id = candidates.object_id`)
  await query(deleteStatement)
  return candidates.length
}
