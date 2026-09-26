import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { markPostPublicationTypedProtocol } from './identity-protocol.mts'
import { getOrCreateSnapshot, retainSnapshotReceiptPage } from './identity-snapshots.mts'

/** Old receipt identities enter the effect stream before an orphan receipt can be accepted away. */
export async function retainOrphanPublicationIdentities(
  work: ClaimedPostPublicationDirtyWork,
  postIds: string[],
  limit: number,
): Promise<boolean> {
  if (!postIds.length) return true
  await using query = await beginTransaction()
  await markPostPublicationTypedProtocol(query)
  const { rows } =
    await query(sql`/* lockOrphanPublicationIdentityLease */ SELECT id FROM post_publication_dirty_work
    WHERE id = ${work.id} AND generation = ${work.generation} AND lease_token = ${work.lease_token}
      AND lease_expires_at > CURRENT_TIMESTAMP FOR UPDATE`)
  if (rows.length !== 1) throw new TypeError('Orphan retention requires a current work lease')
  let complete = true
  for (const postId of postIds) {
    // oxlint-disable-next-line no-await-in-loop -- each orphan has its own resumable receipt cursor.
    const snapshot = await getOrCreateSnapshot(query, work, {
      id: postId,
      eligibility_fingerprint: 'orphan',
      is_public: false,
    })
    // oxlint-disable-next-line no-await-in-loop -- each receipt is retained in bounded exact pages under the work lease.
    complete = (await retainSnapshotReceiptPage(query, work, postId, snapshot, limit)) && complete
  }
  await query.commit()
  return complete
}
