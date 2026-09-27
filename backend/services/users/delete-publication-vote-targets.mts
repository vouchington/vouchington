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
  const postTargetsByTable = new Map<string, EntityRelationVoteTarget[]>()
  const topicAliasTargetsByTable = new Map<string, EntityRelationVoteTarget[]>()
  const topicTargetsByTable = new Map<string, EntityRelationVoteTarget[]>()
  for (const target of targets) {
    const targetsByTable = isPostScopedPublicationRelationTable(target.relationTable)
      ? postTargetsByTable
      : isRssFeedItemTopicAliasPublicationRelationTable(target.relationTable)
        ? topicAliasTargetsByTable
        : isTopicPublisherTypePublicationRelationTable(target.relationTable)
          ? topicTargetsByTable
          : undefined
    if (!targetsByTable) continue
    const tableTargets = targetsByTable.get(target.relationTable) ?? []
    tableTargets.push(target)
    targetsByTable.set(target.relationTable, tableTargets)
  }

  // ast-grep-ignore: no-three-sequential-awaits -- one transaction client serializes the scope-specific whitelisted reads.
  const postIds = await getPublicationVoteTargetScopeIds(query, postTargetsByTable, 'subject_id')
  const topicAliasIds = await getPublicationVoteTargetScopeIds(
    query,
    topicAliasTargetsByTable,
    'object_id',
  )
  const topicIds = await getPublicationVoteTargetScopeIds(query, topicTargetsByTable, 'subject_id')
  return { postIds, topicAliasIds, topicIds }
}

async function getPublicationVoteTargetScopeIds(
  query: TransactionQuery,
  targetsByTable: ReadonlyMap<string, readonly EntityRelationVoteTarget[]>,
  scopeColumn: 'subject_id' | 'object_id',
): Promise<string[]> {
  if (targetsByTable.size === 0) return []

  const statement = sql`/* getPublicationVoteTargetScopeIds */ SELECT `
  statement.append(scopeColumn)
  statement.append(sql` FROM (`)
  for (const [index, [table, targets]] of [...targetsByTable]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .entries()) {
    if (index > 0) statement.append(sql` UNION ALL `)
    statement
      .append(sql`SELECT `)
      .append(scopeColumn)
      .append(sql` FROM `)
      .append(assertWhitelistedSqlIdentifier(table, electionTables, 'entityRelationTable'))
      .append(sql` WHERE (subject_id, id) IN (
        SELECT subject_id, relation_id FROM UNNEST(
          ${targets.map(target => target.subjectId)}::uuid[],
          ${targets.map(target => target.entityRelationId)}::uuid[]
        ) AS target(subject_id, relation_id)
      )`)
  }
  statement.append(sql`) AS publication_targets ORDER BY `)
  statement.append(scopeColumn)
  const { rows } = await query<Record<typeof scopeColumn, string>>(statement)
  return rows.map(row => row[scopeColumn])
}
