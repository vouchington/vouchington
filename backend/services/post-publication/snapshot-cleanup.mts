import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { markPostPublicationTypedProtocol } from './identity-protocol.mts'

/** Reclaims only unaccepted abandoned/stale attempts, with independent row caps for both tables. */
export async function cleanupPostPublicationIdentitySnapshots(
  limit = 100,
  dirtyWorkId?: string,
): Promise<{ keys: number; snapshots: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Snapshot cleanup limit must be positive')
  await using query = await beginTransaction()
  await markPostPublicationTypedProtocol(query)
  const { rows } = await query<{ id: string }>(sql`/* lockStalePublicationIdentitySnapshots */
    SELECT snapshot.id FROM post_publication_identity_snapshots snapshot
    WHERE (${dirtyWorkId ?? null}::uuid IS NULL OR snapshot.dirty_work_id = ${dirtyWorkId ?? null}::uuid)
      AND NOT EXISTS (SELECT 1 FROM post_publication_projection_receipts WHERE applied_snapshot_id = snapshot.id)
      AND (snapshot.abandoned_at IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM post_publication_dirty_work WHERE id = snapshot.dirty_work_id AND generation = snapshot.generation))
    ORDER BY snapshot.id LIMIT ${limit} FOR UPDATE SKIP LOCKED`)
  const ids = rows.map(row => row.id)
  const { rowCount: keys } = await query(sql`/* deleteStalePublicationSnapshotKeyPage */
    DELETE FROM post_publication_identity_snapshot_keys WHERE id IN (
      SELECT id FROM post_publication_identity_snapshot_keys WHERE snapshot_id = ANY(${ids}::uuid[])
      ORDER BY id LIMIT ${limit})`)
  const { rowCount: snapshots } = await query(sql`/* deleteEmptyStalePublicationSnapshots */
    DELETE FROM post_publication_identity_snapshots snapshot WHERE id = ANY(${ids}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM post_publication_identity_snapshot_keys WHERE snapshot_id = snapshot.id)
      AND NOT EXISTS (SELECT 1 FROM post_publication_projection_receipts WHERE applied_snapshot_id = snapshot.id)`)
  await query.commit()
  return { keys: keys ?? 0, snapshots: snapshots ?? 0 }
}
