import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function hasTestPublicationSnapshot(snapshotId: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(sql`/* hasTestPublicationSnapshot */
    SELECT EXISTS (SELECT 1 FROM post_publication_identity_snapshots WHERE id = ${snapshotId}) AS exists`)
  return rows[0]?.exists ?? false
}

/** Two sweep traversals, counting only keys that can actually pin reclamation progress. */
export async function getTestPublicationCleanupTraversalBound(limit: number): Promise<number> {
  const { rows } = await write<{
    headers: string
    keys: string
  }>(sql`/* getTestPublicationCleanupTraversalBound */
    WITH eligible AS (SELECT snapshot.id FROM post_publication_identity_snapshots snapshot
      WHERE NOT EXISTS (SELECT 1 FROM post_publication_projection_receipts WHERE applied_snapshot_id = snapshot.id)
        AND (snapshot.abandoned_at IS NOT NULL OR NOT EXISTS (
          SELECT 1 FROM post_publication_dirty_work WHERE id = snapshot.dirty_work_id AND generation = snapshot.generation)))
    SELECT (SELECT COUNT(*) FROM post_publication_identity_snapshots)::text AS headers,
      (SELECT COUNT(*) FROM post_publication_identity_snapshot_keys JOIN eligible ON eligible.id = snapshot_id)::text AS keys`)
  return (
    2 * (Math.ceil(Number(rows[0]!.headers) / limit) + Math.ceil(Number(rows[0]!.keys) / limit) + 2)
  )
}

export async function readTestPublicationSnapshotIds(ids: readonly string[]): Promise<string[]> {
  const { rows } = await write<{ id: string }>(sql`/* readTestPublicationSnapshotIds */
    SELECT id FROM post_publication_identity_snapshots WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
  return rows.map(row => row.id)
}

export async function lockTestPublicationSnapshots(
  query: TransactionQuery,
  ids: string[],
): Promise<void> {
  await query(
    sql`/* lockTestPublicationSnapshots */ SELECT id FROM post_publication_identity_snapshots WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`,
  )
}
