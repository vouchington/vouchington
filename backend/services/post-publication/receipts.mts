import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  isPostPublicationTypedProtocolActive,
  markPostPublicationTypedProtocol,
} from './identity-protocol.mts'
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
  await markPostPublicationTypedProtocol(query)
  if (await isPostPublicationTypedProtocolActive(query)) {
    const accepted = await acknowledgeTypedReceipts(query, work, posts)
    if (accepted) await query.commit()
    return accepted
  }
  if (posts.some(post => post.identity_snapshot_id)) return false
  const { rowCount } = await query(
    `/* acknowledgePostPublicationProjectionReceipts */
    INSERT INTO post_publication_projection_receipts (
      post_id, eligibility_fingerprint, applied_generation, applied_identity, applied_snapshot_id
    )
    SELECT receipt.post_id, receipt.eligibility_fingerprint, $1, receipt.applied_identity, NULL::uuid
    FROM UNNEST($2::uuid[], $3::text[], $4::jsonb[]) AS receipt(post_id, eligibility_fingerprint, applied_identity)
    WHERE EXISTS (
      SELECT 1 FROM post_publication_dirty_work
      WHERE id = $5 AND generation = $1 AND lease_token = $6 AND lease_expires_at > CURRENT_TIMESTAMP
    )
    ORDER BY receipt.post_id
    ON CONFLICT (post_id) DO UPDATE SET eligibility_fingerprint = EXCLUDED.eligibility_fingerprint,
      applied_generation = EXCLUDED.applied_generation, applied_identity = EXCLUDED.applied_identity,
      applied_snapshot_id = EXCLUDED.applied_snapshot_id,
      applied_at = CURRENT_TIMESTAMP`,
    [
      work.generation,
      posts.map(post => post.id),
      posts.map(post => post.eligibility_fingerprint),
      posts.map(post => JSON.stringify(post.projection_identity)),
      work.id,
      work.lease_token,
    ],
  )
  if (rowCount === posts.length) await query.commit()
  return rowCount === posts.length
}

async function acknowledgeTypedReceipts(
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
    INSERT INTO post_publication_projection_receipts (post_id, eligibility_fingerprint, applied_generation, applied_identity, applied_snapshot_id)
    SELECT candidate.id, snapshot.eligibility_fingerprint, snapshot.generation,
      '{"topicIds":[],"identityKeys":[],"sitemapTargets":[]}'::jsonb, snapshot.id
    FROM UNNEST(${posts.map(post => post.id)}::uuid[], ${posts.map(post => post.identity_snapshot_id)}::uuid[]) receipt(post_id, snapshot_id)
    JOIN post_publication_identity_snapshots snapshot ON snapshot.id = receipt.snapshot_id AND snapshot.post_id = receipt.post_id
    JOIN posts candidate ON candidate.id = receipt.post_id JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
    WHERE snapshot.dirty_work_id = ${work.id} AND snapshot.generation = ${work.generation}
      AND snapshot.completed_at IS NOT NULL AND snapshot.abandoned_at IS NULL
      AND snapshot.eligibility_fingerprint = `
  statement
    .append(publicationEligibilityFingerprintSql(true))
    .append(sql` AND NOT `)
    .append(publicationSnapshotMismatchSql(sql`candidate.id`, sql`snapshot.id`)).append(sql`
    ORDER BY candidate.id ON CONFLICT (post_id) DO UPDATE SET eligibility_fingerprint = EXCLUDED.eligibility_fingerprint,
      applied_generation = EXCLUDED.applied_generation, applied_identity = EXCLUDED.applied_identity,
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
  await query(
    `/* markPostPublicationTypedProtocol */ SELECT set_config('voucha.post_publication_protocol', 'typed-v1', true)`,
  )
  const { rowCount } = await query(
    `/* deleteOrphanPostPublicationProjectionReceipts */
    DELETE FROM post_publication_projection_receipts receipt
    WHERE receipt.post_id = ANY($1::uuid[])
      AND NOT EXISTS (SELECT 1 FROM posts WHERE posts.id = receipt.post_id)
      AND EXISTS (
        SELECT 1 FROM post_publication_dirty_work
        WHERE id = $2 AND generation = $3 AND lease_token = $4 AND lease_expires_at > CURRENT_TIMESTAMP
      )`,
    [postIds, work.id, work.generation, work.lease_token],
  )
  if (rowCount === postIds.length) await query.commit()
  return rowCount === postIds.length
}
