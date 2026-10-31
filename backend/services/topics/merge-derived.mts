import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'

import { derivedReferences } from './merge-derived-references.mts'

export { derivedReferences }

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
