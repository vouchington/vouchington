import { markStoryCategoryProjectionWork } from '@services/post-publication/story-category-projection-work'
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
  if (tableName === 'story_post_category_projection_receipts') {
    const { rows } = await query<{ story_id: string }>(
      `/* selectTopicMergeStoryCategoryReceipts */ SELECT story_id
       FROM story_post_category_projection_receipts WHERE topic_id = $1 LIMIT $2`,
      [sourceId, limit],
    )
    if (rows.length === 0) return 0
    const storyIds = rows.map(row => row.story_id).toSorted()
    // Restart actual pending work before touching receipts: workers take this same order.
    await markStoryCategoryProjectionWork(query, storyIds)
    await query(
      `/* deleteTopicMergeStoryCategoryReceipts */ DELETE FROM story_post_category_projection_receipts
       WHERE topic_id = $1 AND story_id = ANY($2::uuid[])`,
      [sourceId, storyIds],
    )
    // Consumed candidates still advance the bounded stage even if a worker removed them first.
    return rows.length
  }
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
