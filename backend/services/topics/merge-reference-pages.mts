import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'
import {
  topicMergeReferencePageTables as tables,
  topicMergeReferencePageColumns as columns,
} from './merge-reference-page-inventory.mts'
import {
  processTopicMergeBookmarkReferencePage,
  processTopicMergeClaimReferencePage,
} from './merge-reference-conflict-pages.mts'
import type { MergeReferenceTable } from './merge-reference-sql.mts'
import { processTopicMergeVoteReferencePage } from './merge-topic-votes-page.mts'

/** A finite inventory selects one index-served source column and one bounded write page. */
export async function processTopicMergeReferencePage(
  query: TransactionQuery,
  operationId: string,
  reference: MergeReferenceTable,
  sourceId: string,
  destinationId: string,
  limit: number,
): Promise<number> {
  const table = assertWhitelistedSqlIdentifier(reference.table, tables, 'topicMergePageTable')
  const sourceColumns = reference.columns.map(column =>
    assertWhitelistedSqlIdentifier(column, columns, 'topicMergePageColumn'),
  )
  const source = sourceColumns.map(column => `s.${column} = $1::uuid`).join(' OR ')
  const map = (column: string) =>
    sourceColumns.includes(column)
      ? `CASE WHEN s.${column} = $1::uuid THEN $2::uuid ELSE s.${column} END`
      : `s.${column}`
  const assignments = sourceColumns.map(column => `${column} = ${map(column)}`).join(', ')
  const collision = reference.collisionKey
    ?.map(column => {
      const identifier = assertWhitelistedSqlIdentifier(
        column,
        columns,
        'topicMergeCollisionColumn',
      )
      return `d.${identifier} IS NOT DISTINCT FROM ${map(identifier)}`
    })
    .join(' AND ')
  const live = reference.live
    ? `AND ${reference.live.replaceAll(/\b([a-z_]+_at)\b/g, 'd.$1')} AND ${reference.live.replaceAll(/\b([a-z_]+_at)\b/g, 's.$1')}`
    : ''
  const collides = collision
    ? `EXISTS (SELECT 1 FROM ${table} d WHERE ${collision} AND (d.tableoid,d.ctid) <> (s.tableoid,s.ctid) ${live})`
    : 'FALSE'
  // Claims have retained moderation references. Drain the one losing claim's SET NULL fan-out
  // before deleting that parent; the source row stays selectable until its children are empty.
  if (reference.preferVerified)
    return processTopicMergeClaimReferencePage(query, sourceId, destinationId, limit)
  if (reference.table === 'topic_votes')
    return processTopicMergeVoteReferencePage(query, operationId, sourceId, destinationId, limit)
  if (reference.table.startsWith('relation__'))
    return processTopicMergeBookmarkReferencePage(query, reference, sourceId, destinationId)
  const { rows } = await query<{ consumed: number }>(
    `/* processTopicMergeReferencePage */ WITH page AS MATERIALIZED (
      SELECT s.tableoid, s.ctid FROM ${table} s WHERE ${source} LIMIT $3
    ), removed AS (
      DELETE FROM ${table} s USING page WHERE s.tableoid = page.tableoid AND s.ctid = page.ctid AND ${collides} RETURNING 1
    ), moved AS (
      UPDATE ${table} s SET ${assignments} FROM page
      WHERE s.tableoid = page.tableoid AND s.ctid = page.ctid AND NOT ${collides} RETURNING 1
    ) SELECT count(*)::integer AS consumed FROM page`,
    [sourceId, destinationId, limit],
  )
  return rows[0]!.consumed
}
