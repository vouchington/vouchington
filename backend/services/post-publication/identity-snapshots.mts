import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { publicationSnapshotMismatchSql } from './identity-source.mts'
import { listPublicationIdentitySourcePage } from './identity-source-paging.mts'
import { persistPublicationSnapshotPage } from './snapshot-key-writes.mts'
import { retainStoredPublicationIdentityPage } from './retain-stored-identities.mts'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'

export const POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE = 100
type SnapshotPost = { id: string; eligibility_fingerprint: string; is_public: boolean }
export type Snapshot = {
  id: string
  cursor_kind: string | null
  cursor_value: string | null
  completed_at: Date | null
  eligibility_fingerprint: string
  receipt_cursor_kind: string | null
  receipt_cursor_value: string | null
  receipt_retained_at: Date | null
  receipt_source_version: string | null
}

/** Inserts, retention and progress commit under the same current generation lease. */
export async function materializePostPublicationIdentitySnapshot(
  work: ClaimedPostPublicationDirtyWork,
  post: SnapshotPost,
  limit = POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE,
): Promise<{ snapshotId: string; complete: boolean }> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Snapshot page limit must be positive')
  await using query = await beginTransaction()
  const { rows: leases } = await query(sql`/* lockPostPublicationSnapshotLease */
    SELECT id FROM post_publication_dirty_work WHERE id = ${work.id} AND generation = ${work.generation}
      AND lease_token = ${work.lease_token} AND lease_expires_at > CURRENT_TIMESTAMP FOR UPDATE`)
  if (leases.length !== 1) throw new TypeError('Publication snapshot requires a current work lease')
  const snapshot = await getOrCreateSnapshot(query, work, post)
  if (!(await retainSnapshotReceiptPage(query, work, post.id, snapshot, limit))) {
    await query.commit()
    return { snapshotId: snapshot.id, complete: false }
  }
  let complete = snapshot.completed_at !== null
  if (!complete) {
    const page = await listPublicationIdentitySourcePage(
      query,
      post.id,
      snapshot.cursor_kind,
      snapshot.cursor_value,
      limit,
    )
    await persistPublicationSnapshotPage(query, snapshot.id, work.id, page.keys)
    complete = page.complete
    await query(sql`/* checkpointPostPublicationIdentitySnapshot */ UPDATE post_publication_identity_snapshots
      SET source_cursor_kind = ${page.cursorKind},
        source_cursor_value = ${page.cursorValue},
        completed_at = CASE WHEN ${complete} THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ${snapshot.id}`)
  }
  if (complete) {
    const comparison = sql`/* validatePostPublicationIdentitySnapshot */ SELECT `
    comparison
      .append(publicationSnapshotMismatchSql(sql`${post.id}::uuid`, sql`${snapshot.id}::uuid`))
      .append(sql` OR NOT EXISTS (
      SELECT 1 FROM posts candidate JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
      WHERE candidate.id = ${post.id} AND `)
      .append(publicationEligibilityFingerprintSql())
      .append(sql` = ${snapshot.eligibility_fingerprint}) AS mismatch`)
    const { rows } = await query<{ mismatch: boolean }>(comparison)
    if (rows[0]?.mismatch || snapshot.eligibility_fingerprint !== post.eligibility_fingerprint) {
      await query(
        sql`/* restartPostPublicationIdentitySnapshot */ UPDATE post_publication_identity_snapshots SET abandoned_at = CURRENT_TIMESTAMP WHERE id = ${snapshot.id}`,
      )
      complete = false
    }
  }
  const { rows: currentLease } =
    await query(sql`/* validateSnapshotLeaseAtCommit */ SELECT id FROM post_publication_dirty_work
    WHERE id = ${work.id} AND generation = ${work.generation} AND lease_token = ${work.lease_token} AND lease_expires_at > clock_timestamp()`)
  if (currentLease.length !== 1)
    throw new TypeError('Publication snapshot requires a current work lease')
  await query.commit()
  return { snapshotId: snapshot.id, complete }
}

export async function getOrCreateSnapshot(
  query: TransactionQuery,
  work: ClaimedPostPublicationDirtyWork,
  post: SnapshotPost,
): Promise<Snapshot> {
  await retainPublicationIdentityBridges(query, 'post', [post.id])
  const { rows } = await query<Snapshot>(sql`/* getOrCreatePostPublicationIdentitySnapshot */
    WITH existing AS (
      SELECT id, source_cursor_kind AS cursor_kind, source_cursor_value AS cursor_value, completed_at, eligibility_fingerprint,
        receipt_cursor_kind, receipt_cursor_value, receipt_retained_at, receipt_source_version
      FROM post_publication_identity_snapshots WHERE dirty_work_id = ${work.id} AND generation = ${work.generation}
        AND post_identity_id = ${post.id} AND abandoned_at IS NULL ORDER BY id DESC LIMIT 1
    ), inserted AS (
      INSERT INTO post_publication_identity_snapshots (dirty_work_id, generation, post_identity_id, eligibility_fingerprint, is_public)
      SELECT ${work.id}, ${work.generation}, ${post.id}, ${post.eligibility_fingerprint}, ${post.is_public}
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id, source_cursor_kind AS cursor_kind, source_cursor_value AS cursor_value, completed_at, eligibility_fingerprint,
        receipt_cursor_kind, receipt_cursor_value, receipt_retained_at, receipt_source_version
    ) SELECT * FROM existing UNION ALL SELECT * FROM inserted`)
  const snapshot = rows[0]
  if (!snapshot) throw new Error('Post publication snapshot was not created')
  return snapshot
}

export async function retainSnapshotReceiptPage(
  query: TransactionQuery,
  work: ClaimedPostPublicationDirtyWork,
  postId: string,
  snapshot: Snapshot,
  limit: number,
): Promise<boolean> {
  const { rows: receipts } = await query<{
    version: string
  }>(sql`/* getPublicationReceiptRetentionVersion */
    SELECT applied_snapshot_id::text AS version FROM post_publication_projection_receipts WHERE post_identity_id = ${postId}`)
  const version = receipts[0]?.version ?? null
  if (version !== snapshot.receipt_source_version) {
    snapshot.receipt_cursor_kind = null
    snapshot.receipt_cursor_value = null
    snapshot.receipt_retained_at = null
  }
  if (snapshot.receipt_retained_at !== null) return true
  const page = await retainStoredPublicationIdentityPage(
    query,
    work.id,
    postId,
    snapshot.receipt_cursor_kind,
    snapshot.receipt_cursor_value,
    limit,
  )
  const complete = page.complete
  await query(sql`/* checkpointPublicationReceiptRetention */ UPDATE post_publication_identity_snapshots
    SET receipt_cursor_kind = ${page.cursorKind},
      receipt_cursor_value = ${page.cursorValue},
      receipt_retained_at = CASE WHEN ${complete} THEN CURRENT_TIMESTAMP ELSE NULL END,
      receipt_source_version = ${version} WHERE id = ${snapshot.id}`)
  return complete
}
