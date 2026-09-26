import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function hasTestPublicationSnapshot(snapshotId: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(sql`/* hasTestPublicationSnapshot */
    SELECT EXISTS (SELECT 1 FROM post_publication_identity_snapshots WHERE id = ${snapshotId}) AS exists`)
  return rows[0]?.exists ?? false
}

/** Two complete sweep traversals, including all current key pages on a dirty database. */
export async function getTestPublicationCleanupTraversalBound(limit: number): Promise<number> {
  const { rows } = await write<{
    headers: string
    keys: string
  }>(sql`/* getTestPublicationCleanupTraversalBound */
    SELECT (SELECT COUNT(*) FROM post_publication_identity_snapshots)::text AS headers,
      (SELECT COUNT(*) FROM post_publication_identity_snapshot_keys)::text AS keys`)
  return (
    2 * (Math.ceil(Number(rows[0]!.headers) / limit) + Math.ceil(Number(rows[0]!.keys) / limit) + 2)
  )
}

export async function lockTestPublicationSnapshots(
  query: TransactionQuery,
  ids: string[],
): Promise<void> {
  await query(
    sql`/* lockTestPublicationSnapshots */ SELECT id FROM post_publication_identity_snapshots WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`,
  )
}
