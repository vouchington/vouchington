import { assertWhitelistedSqlIdentifier, type TransactionQuery } from '@data-stores/psql'
import type { MergeReferenceTable } from './merge-reference-sql.mts'
import { topicMergeReferencePageTables } from './merge-reference-page-inventory.mts'

export async function processTopicMergeClaimReferencePage(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
  limit: number,
): Promise<number> {
  const { rows } = await query<{ id: string; loser_id: string | null }>(
    `/* processTopicMergeClaimPage select */ SELECT s.id,
      CASE WHEN d.id IS NULL THEN NULL WHEN s.verified_at IS NOT NULL AND d.verified_at IS NULL THEN d.id ELSE s.id END AS loser_id
      FROM topic_claims s LEFT JOIN topic_claims d ON d.topic_id = $2::uuid AND d.claimant_user_id = s.claimant_user_id
        AND d.rejected_at IS NULL AND d.revoked_at IS NULL AND s.rejected_at IS NULL AND s.revoked_at IS NULL
      WHERE s.topic_id = $1::uuid ORDER BY s.id LIMIT 1 FOR UPDATE OF s`,
    [sourceId, destinationId],
  )
  const row = rows[0]
  if (!row) return 0
  if (row.loser_id) {
    const { rowCount } = await query(
      `/* processTopicMergeClaimPage history */ WITH page AS MATERIALIZED (
      SELECT id FROM moderator_actions WHERE topic_claim_id = $1::uuid ORDER BY id LIMIT $2 FOR UPDATE
    ) UPDATE moderator_actions SET topic_claim_id = NULL FROM page WHERE moderator_actions.id = page.id`,
      [row.loser_id, limit],
    )
    if (rowCount) return rowCount
    await query(
      `/* processTopicMergeClaimPage delete */ DELETE FROM topic_claims WHERE id = $1::uuid`,
      [row.loser_id],
    )
  }
  if (row.loser_id !== row.id)
    await query(
      `/* processTopicMergeClaimPage move */ UPDATE topic_claims SET topic_id = $2::uuid WHERE id = $1::uuid`,
      [row.id, destinationId],
    )
  return 1
}

export async function processTopicMergeBookmarkReferencePage(
  query: TransactionQuery,
  reference: MergeReferenceTable,
  sourceId: string,
  destinationId: string,
): Promise<number> {
  const table = assertWhitelistedSqlIdentifier(
    reference.table,
    topicMergeReferencePageTables,
    'topicMergeBookmarkTable',
  )
  const topicColumns = reference.columns
  const map = (column: string) =>
    topicColumns.includes(column)
      ? `CASE WHEN s.${column} = $1::uuid THEN $2::uuid ELSE s.${column} END`
      : `s.${column}`
  const { rows } = await query<{
    subject_id: string
    object_id: string
    next_subject: string
    next_object: string
    destination_exists: boolean
    source_wins: boolean
  }>(
    `/* processTopicMergeBookmarkPage select */ WITH source AS MATERIALIZED (
      SELECT * FROM ${table} s WHERE ${topicColumns.map(column => `s.${column} = $1::uuid`).join(' OR ')} LIMIT 1 FOR UPDATE
    ) SELECT s.subject_id,s.object_id,${map('subject_id')} AS next_subject,${map('object_id')} AS next_object,
      d.subject_id IS NOT NULL AS destination_exists,
      s.deleted_at IS NULL AND d.deleted_at IS NOT NULL AS source_wins
      FROM source s LEFT JOIN ${table} d ON d.subject_id = ${map('subject_id')} AND d.object_id = ${map('object_id')}`,
    [sourceId, destinationId],
  )
  const row = rows[0]
  if (!row) return 0
  // Only source-incident rows are selected. A parent edge pointing at the merge
  // destination would become a self-relation; leave any existing destination
  // self-relation alone.
  if (topicColumns.length === 2 && row.next_subject === row.next_object) {
    await query(
      `/* processTopicMergeBookmarkPage self relation */ DELETE FROM ${table}
      WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
      [row.subject_id, row.object_id],
    )
    return 1
  }
  if (row.destination_exists)
    await query(
      `/* processTopicMergeBookmarkPage loser */ DELETE FROM ${table}
    WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
      row.source_wins ? [row.next_subject, row.next_object] : [row.subject_id, row.object_id],
    )
  if (!row.destination_exists || row.source_wins)
    await query(
      `/* processTopicMergeBookmarkPage move */ UPDATE ${table}
    SET subject_id = $3::uuid,object_id = $4::uuid WHERE subject_id = $1::uuid AND object_id = $2::uuid`,
      [row.subject_id, row.object_id, row.next_subject, row.next_object],
    )
  return 1
}
