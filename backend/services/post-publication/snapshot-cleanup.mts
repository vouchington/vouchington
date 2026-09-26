import { publicationPageLimit } from './page-limit.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { publicationSnapshotKeyPageSql } from './snapshot-key-pages.mts'

/** Reclaims only unaccepted abandoned/stale attempts, with independent row caps for both tables. */
export async function cleanupPostPublicationIdentitySnapshots(
  limit = 100,
): Promise<{ keys: number; snapshots: number; scanned: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Snapshot cleanup limit must be positive')
  await using query = await beginTransaction()
  const { rows: progress } = await query<{
    cursor_snapshot_id: string | null
  }>(sql`/* lockPublicationSnapshotCleanupProgress */
    SELECT cursor_snapshot_id FROM post_publication_identity_cleanup_progress WHERE singleton FOR UPDATE`)
  const cursor = progress[0]!.cursor_snapshot_id
  const candidateStatement = sql`/* listPublicationSnapshotCleanupHeaderPage */
    SELECT snapshot.id FROM post_publication_identity_snapshots snapshot
      WHERE TRUE`
  if (cursor !== null) candidateStatement.append(sql` AND snapshot.id > ${cursor}::uuid`)
  candidateStatement.append(' ORDER BY snapshot.id LIMIT ').append(publicationPageLimit(limit))
  const { rows: candidates } = await query<{ id: string }>(candidateStatement)
  const { rows: headers } = await query<{
    id: string
    eligible: boolean
  }>(sql`/* lockPublicationSnapshotCleanupHeaderPage */
    WITH page AS MATERIALIZED (SELECT snapshot.* FROM unnest(${candidates.map(row => row.id)}::uuid[]) candidate(id)
      CROSS JOIN LATERAL (SELECT id, dirty_work_id, generation, abandoned_at
        FROM post_publication_identity_snapshots WHERE id = candidate.id LIMIT 1 FOR UPDATE SKIP LOCKED) snapshot)
    SELECT page.id, (SELECT applied_snapshot_id FROM post_publication_projection_receipts WHERE applied_snapshot_id = page.id LIMIT 1) IS NULL
      AND (page.abandoned_at IS NOT NULL OR (SELECT generation FROM post_publication_dirty_work WHERE id = page.dirty_work_id) IS DISTINCT FROM page.generation) AS eligible
    FROM page ORDER BY page.id`)
  const ids = headers.flatMap(row => (row.eligible ? [row.id] : []))
  const keyStatement = sql`/* deleteStalePublicationSnapshotKeyPage */
    DELETE FROM post_publication_identity_snapshot_keys target USING (`
    .append(publicationSnapshotKeyPageSql(ids[0] ?? null, null, limit))
    .append(
      sql`) key_page WHERE target.snapshot_id = ${ids[0] ?? null}::uuid AND target.id = key_page.id`,
    )
  const { rowCount: keys } = await query(keyStatement)
  const { rowCount: snapshots } = await query(sql`/* deleteEmptyStalePublicationSnapshots */
    DELETE FROM post_publication_identity_snapshots snapshot WHERE id = ANY(${ids}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM post_publication_identity_snapshot_keys WHERE snapshot_id = snapshot.id)
      AND NOT EXISTS (SELECT 1 FROM post_publication_projection_receipts WHERE applied_snapshot_id = snapshot.id)`)
  const { rows: remaining } = await query<{
    id: string
  }>(sql`/* findPartiallyReclaimedPublicationSnapshot */
    SELECT id FROM post_publication_identity_snapshots WHERE id = ANY(${ids}::uuid[]) ORDER BY id LIMIT 1`)
  const firstRemaining = remaining[0]?.id
  const processed =
    firstRemaining === undefined
      ? candidates
      : candidates.filter(candidate => candidate.id < firstRemaining)
  const nextCursor =
    firstRemaining === undefined && candidates.length < limit
      ? null
      : (processed.at(-1)?.id ?? cursor)
  await query(sql`/* checkpointPublicationSnapshotCleanupSweep */ UPDATE post_publication_identity_cleanup_progress
      SET cursor_snapshot_id = ${nextCursor}, updated_at = CURRENT_TIMESTAMP WHERE singleton`)
  await query.commit()
  return { keys: keys ?? 0, snapshots: snapshots ?? 0, scanned: candidates.length }
}
