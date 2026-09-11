import { write } from '@data-stores/psql'
import type { ReconciliationPost } from './reconcile.mts'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'

/** Records the exact applied snapshot only while the dirty-work generation lease remains valid. */
export async function acknowledgePostPublicationProjectionReceipts(
  work: ClaimedPostPublicationDirtyWork,
  posts: ReconciliationPost[],
): Promise<boolean> {
  if (posts.length === 0) return true
  const { rowCount } = await write(
    `/* acknowledgePostPublicationProjectionReceipts */
    INSERT INTO post_publication_projection_receipts (
      post_id, eligibility_fingerprint, applied_generation, applied_identity
    )
    SELECT receipt.post_id, receipt.eligibility_fingerprint, $1, receipt.applied_identity
    FROM UNNEST($2::uuid[], $3::text[], $4::jsonb[])
      AS receipt(post_id, eligibility_fingerprint, applied_identity)
    WHERE EXISTS (
      SELECT 1 FROM post_publication_dirty_work
      WHERE id = $5 AND generation = $1 AND lease_token = $6 AND lease_expires_at > CURRENT_TIMESTAMP
    )
    ORDER BY receipt.post_id
    ON CONFLICT (post_id) DO UPDATE SET eligibility_fingerprint = EXCLUDED.eligibility_fingerprint,
      applied_generation = EXCLUDED.applied_generation, applied_identity = EXCLUDED.applied_identity,
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
  return rowCount === posts.length
}

/** Deletes receipt-only tombstones only while the processor's generation lease is still current. */
export async function deleteOrphanPostPublicationProjectionReceipts(
  work: ClaimedPostPublicationDirtyWork,
  postIds: string[],
): Promise<boolean> {
  if (postIds.length === 0) return true
  const { rowCount } = await write(
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
  return rowCount === postIds.length
}
