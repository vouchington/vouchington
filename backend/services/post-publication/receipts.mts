import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { publicationSnapshotMismatchSql } from './identity-source.mts'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'
import type { ReconciliationPost } from './reconcile.mts'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'

/** Records the exact applied snapshot only while the dirty-work generation lease remains valid. */
export async function acknowledgePostPublicationProjectionReceipts(
  work: ClaimedPostPublicationDirtyWork,
  posts: ReconciliationPost[],
): Promise<boolean> {
  if (posts.length === 0) return true
  await using query = await beginTransaction()
  const accepted = await acknowledgeSnapshotReceipts(query, work, posts)
  if (accepted) await query.commit()
  return accepted
}

async function acknowledgeSnapshotReceipts(
  query: TransactionQuery,
  work: ClaimedPostPublicationDirtyWork,
  posts: ReconciliationPost[],
): Promise<boolean> {
  if (posts.some(post => !post.identity_snapshot_id)) return false
  const { rows: lease } = await query(sql`/* lockTypedPublicationReceiptLease */
    SELECT id FROM post_publication_dirty_work WHERE id = ${work.id} AND generation = ${work.generation}
      AND lease_token = ${work.lease_token} AND lease_expires_at > CURRENT_TIMESTAMP FOR UPDATE`)
  if (lease.length !== 1) return false
  const statement = sql`/* acknowledgeTypedPostPublicationReceipts */
    INSERT INTO post_publication_projection_receipts (post_identity_id, eligibility_fingerprint, applied_generation, applied_snapshot_id)
    SELECT candidate.id, snapshot.eligibility_fingerprint, snapshot.generation, snapshot.id
    FROM UNNEST(${posts.map(post => post.id)}::uuid[], ${posts.map(post => post.identity_snapshot_id)}::uuid[]) receipt(post_identity_id, snapshot_id)
    JOIN post_publication_identity_snapshots snapshot ON snapshot.id = receipt.snapshot_id AND snapshot.post_identity_id = receipt.post_identity_id
    JOIN post_publication_post_identities identity ON identity.id = receipt.post_identity_id
    JOIN posts candidate ON candidate.id = identity.post_id JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
    WHERE snapshot.dirty_work_id = ${work.id} AND snapshot.generation = ${work.generation}
      AND snapshot.completed_at IS NOT NULL AND snapshot.abandoned_at IS NULL
      AND snapshot.eligibility_fingerprint = `
  statement
    .append(publicationEligibilityFingerprintSql())
    .append(sql` AND NOT `)
    .append(publicationSnapshotMismatchSql(sql`candidate.id`, sql`snapshot.id`)).append(sql`
    ORDER BY candidate.id ON CONFLICT (post_identity_id) DO UPDATE SET eligibility_fingerprint = EXCLUDED.eligibility_fingerprint,
      applied_generation = EXCLUDED.applied_generation,
      applied_snapshot_id = EXCLUDED.applied_snapshot_id, applied_at = CURRENT_TIMESTAMP`)
  const { rowCount } = await query(statement)
  if (rowCount !== posts.length) return false
  const { rows: currentLease } =
    await query(sql`/* validateReceiptLeaseAtAcceptance */ SELECT id FROM post_publication_dirty_work
    WHERE id = ${work.id} AND generation = ${work.generation} AND lease_token = ${work.lease_token} AND lease_expires_at > clock_timestamp()`)
  return currentLease.length === 1
}

/** Deletes receipt-only tombstones only while the processor's generation lease is still current. */
export async function deleteOrphanPostPublicationProjectionReceipts(
  work: ClaimedPostPublicationDirtyWork,
  postIds: string[],
): Promise<boolean> {
  if (postIds.length === 0) return true
  await using query = await beginTransaction()
  const rowCount = await deleteOrphanReceiptPage(query, work, postIds)
  if (rowCount === postIds.length) await query.commit()
  return rowCount === postIds.length
}

async function deleteOrphanReceiptPage(
  query: TransactionQuery,
  work: ClaimedPostPublicationDirtyWork,
  postIds: string[],
): Promise<number | null> {
  const { rowCount } = await query(
    `/* deleteOrphanPostPublicationProjectionReceipts */
    DELETE FROM post_publication_projection_receipts receipt USING post_publication_post_identities identity
    WHERE receipt.post_identity_id = ANY($1::uuid[]) AND identity.id = receipt.post_identity_id
      AND identity.post_id IS NULL
      AND EXISTS (
        SELECT 1 FROM post_publication_dirty_work
        WHERE id = $2 AND generation = $3 AND lease_token = $4 AND lease_expires_at > CURRENT_TIMESTAMP
      )`,
    [postIds, work.id, work.generation, work.lease_token],
  )
  return rowCount
}
