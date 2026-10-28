import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'

export const derivedReferences = [
  ['topic_metrics', 'topic_id'],
  ['bedrock_embedding_batch_entities', 'topic_id'],
  ['classifier_run_candidates', 'topic_id'],
  ['topic_classifier_results', 'topic_id'],
  ['autotagger_agent_run_topics', 'topic_id'],
] as const

const derivedTableNames = derivedReferences.map(([table]) => table)
const derivedColumnNames = derivedReferences.map(([, column]) => column)

/** Removes one bounded page of obsolete rows from one derived table. */
export async function deleteMergedTopicDerivedPage(
  query: TransactionQuery,
  tablePosition: number,
  sourceId: string,
  limit: number,
): Promise<number> {
  const reference = derivedReferences[tablePosition]
  if (!reference) return 0
  const [tableName, columnName] = reference
  const table = assertWhitelistedSqlIdentifier(
    tableName,
    derivedTableNames,
    'topicMergeDerivedTable',
  )
  const column = assertWhitelistedSqlIdentifier(
    columnName,
    derivedColumnNames,
    'topicMergeDerivedColumn',
  )
  const { rowCount } = await query(
    `/* deleteMergedTopicDerivedPage */
      WITH page AS MATERIALIZED (
        SELECT source.tableoid, source.ctid FROM ${table} source
        WHERE source.${column} = $1::uuid LIMIT $2 FOR UPDATE
      )
      DELETE FROM ${table} target USING page
      WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid`,
    [sourceId, limit],
  )
  return rowCount ?? 0
}
