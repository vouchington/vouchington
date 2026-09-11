import { assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  isPostScopedPublicationRelationTable,
  isRssFeedItemTopicAliasPublicationRelationTable,
  isTopicPublisherTypePublicationRelationTable,
} from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'
import type { EntityRelationVoteTarget } from './delete-entity-relation-votes.mts'

const electionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)

type PublicationVoteTargetScopes = {
  postIds: string[]
  topicAliasIds: string[]
  topicIds: string[]
}

/** Reads every publication scope for the user's vote targets before deletion locks any relation row. */
export async function getPublicationVoteTargetScopes(
  query: TransactionQuery,
  targets: readonly EntityRelationVoteTarget[],
): Promise<PublicationVoteTargetScopes> {
  const postTargetIdsByTable = new Map<string, string[]>()
  const topicAliasTargetIdsByTable = new Map<string, string[]>()
  const topicTargetIdsByTable = new Map<string, string[]>()
  for (const target of targets) {
    const targetIdsByTable = isPostScopedPublicationRelationTable(target.relationTable)
      ? postTargetIdsByTable
      : isRssFeedItemTopicAliasPublicationRelationTable(target.relationTable)
        ? topicAliasTargetIdsByTable
        : isTopicPublisherTypePublicationRelationTable(target.relationTable)
          ? topicTargetIdsByTable
          : undefined
    if (!targetIdsByTable) continue
    const ids = targetIdsByTable.get(target.relationTable) ?? []
    ids.push(target.entityRelationId)
    targetIdsByTable.set(target.relationTable, ids)
  }

  // ast-grep-ignore: no-three-sequential-awaits -- one transaction client serializes the scope-specific whitelisted reads.
  const postIds = await getPublicationVoteTargetScopeIds(query, postTargetIdsByTable, 'subject_id')
  const topicAliasIds = await getPublicationVoteTargetScopeIds(
    query,
    topicAliasTargetIdsByTable,
    'object_id',
  )
  const topicIds = await getPublicationVoteTargetScopeIds(
    query,
    topicTargetIdsByTable,
    'subject_id',
  )
  return { postIds, topicAliasIds, topicIds }
}

async function getPublicationVoteTargetScopeIds(
  query: TransactionQuery,
  targetIdsByTable: ReadonlyMap<string, readonly string[]>,
  scopeColumn: 'subject_id' | 'object_id',
): Promise<string[]> {
  if (targetIdsByTable.size === 0) return []

  const statement = sql`/* getPublicationVoteTargetScopeIds */ SELECT `
  statement.append(scopeColumn)
  statement.append(sql` FROM (`)
  for (const [index, [table, ids]] of [...targetIdsByTable]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .entries()) {
    if (index > 0) statement.append(sql` UNION ALL `)
    statement
      .append(sql`SELECT `)
      .append(scopeColumn)
      .append(sql` FROM `)
      .append(assertWhitelistedSqlIdentifier(table, electionTables, 'entityRelationTable'))
      .append(sql` WHERE id = ANY(${ids}::uuid[])`)
  }
  statement.append(sql`) AS publication_targets ORDER BY `)
  statement.append(scopeColumn)
  const { rows } = await query<Record<typeof scopeColumn, string>>(statement)
  return rows.map(row => row[scopeColumn])
}
