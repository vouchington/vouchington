import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'
import {
  isPostScopedPublicationRelationTable,
  isRssFeedItemTopicAliasPublicationRelationTable,
  isTopicPublisherTypePublicationRelationTable,
} from '@services/entity-relations'
import {
  lockPostPublicationPostScopes,
  lockTopicAliasPublicationScopes,
  lockTopicRssFeedPublicationScopes,
} from '@services/post-publication'
import type { EntityRelationElectionTarget } from '@queues/elections/types'
import sql from 'sql-template-strings'
import { entityRelationElectionTables } from './target.mts'

/** Acquires publication scopes before the corresponding relation rows are locked. */
export async function lockEntityRelationVoteStatsPostPublicationScopes(
  query: TransactionQuery,
  relationTable: EntityRelationElectionTarget['relationTable'],
  relationIds: readonly string[],
): Promise<void> {
  const locksPostScopes = isPostScopedPublicationRelationTable(relationTable)
  const locksAliasScopes = isRssFeedItemTopicAliasPublicationRelationTable(relationTable)
  const locksTopicFeedScopes = isTopicPublisherTypePublicationRelationTable(relationTable)
  if ((!locksPostScopes && !locksAliasScopes && !locksTopicFeedScopes) || relationIds.length === 0)
    return
  const table = assertWhitelistedSqlIdentifier(
    relationTable,
    entityRelationElectionTables,
    'entityRelationTable',
  )
  const { rows } = await query<{ subject_id: string; object_id: string }>(
    sql`/* lockEntityRelationVoteStatsPostPublicationScopes */
      SELECT DISTINCT subject_id, object_id
      FROM `.append(table).append(sql`
      WHERE id = ANY(${relationIds}::uuid[])
      ORDER BY subject_id, object_id`),
  )
  if (locksPostScopes)
    await lockPostPublicationPostScopes(
      query,
      rows.map(row => row.subject_id),
    )
  if (locksAliasScopes)
    await lockTopicAliasPublicationScopes(
      query,
      [...new Set(rows.map(row => row.object_id))].toSorted(),
    )
  if (locksTopicFeedScopes)
    await lockTopicRssFeedPublicationScopes(
      query,
      [...new Set(rows.map(row => row.subject_id))].toSorted(),
    )
}
