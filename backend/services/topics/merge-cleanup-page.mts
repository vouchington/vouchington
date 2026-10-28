import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'

const scratch = [
  ['topic_merge_parent_ancestors', 'topic_id'],
  ['topic_merge_metric_users', 'user_id'],
  ['topic_merge_operation_aliases', 'alias_id'],
] as const
const tableNames = scratch.map(([table]) => table)
const keyNames = scratch.map(([, key]) => key)

/** Retain the operation/status history, not per-row execution scratch. */
export async function processTopicMergeCleanupPage(
  query: TransactionQuery,
  operationId: string,
  position: number,
  limit: number,
): Promise<{ position: number; hasMore: boolean }> {
  const entry = scratch[position]
  if (!entry) return { position, hasMore: false }
  const table = assertWhitelistedSqlIdentifier(entry[0], tableNames, 'topicMergeCleanupTable')
  const key = assertWhitelistedSqlIdentifier(entry[1], keyNames, 'topicMergeCleanupKey')
  const { rowCount } = await query(
    `/* processTopicMergeCleanupPage */ WITH page AS MATERIALIZED (
      SELECT ${key} FROM ${table} WHERE operation_id = $1::uuid
      ORDER BY ${key} LIMIT $2::integer FOR UPDATE
    ) DELETE FROM ${table} target USING page
      WHERE target.operation_id = $1::uuid AND target.${key} = page.${key}`,
    [operationId, limit],
  )
  return { position: rowCount ? position : position + 1, hasMore: true }
}
