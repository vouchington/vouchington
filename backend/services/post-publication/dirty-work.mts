import { beginTransaction, write } from '@data-stores/psql'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import { cleanupPostPublicationIdentitySnapshots } from './snapshot-cleanup.mts'
import { cleanupPostPublicationIdentityBridges } from './identity-bridge-cleanup.mts'
import type { ClaimedPostPublicationDirtyWork, PostPublicationDirtyWork } from './types.mts'

export async function listAvailablePostPublicationDirtyWork(
  limit: number,
): Promise<PostPublicationDirtyWork[]> {
  assertPositive(limit)
  await cleanupPostPublicationIdentitySnapshots()
  await cleanupPostPublicationIdentityBridges()
  const { rows } = await write<PostPublicationDirtyWork>(
    `/* listAvailablePostPublicationDirtyWork */
    SELECT id, post_identity_id, author_identity_id, community_identity_id, rss_feed_identity_id, topic_alias_identity_id, story_identity_id, reasons::text[] AS reasons,
      generation, cursor_post_id, pending_post_identity_id, pending_ancestor_post_identity_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at
    FROM post_publication_dirty_work
    WHERE lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP
    ORDER BY id LIMIT $1`,
    [limit],
  )
  return rows
}
export async function claimPostPublicationDirtyWork(
  work: Pick<PostPublicationDirtyWork, 'id' | 'generation'>,
  leaseSeconds: number,
): Promise<ClaimedPostPublicationDirtyWork | undefined> {
  assertPositive(leaseSeconds)
  const { rows } = await write<ClaimedPostPublicationDirtyWork>(
    `/* claimPostPublicationDirtyWork */
    UPDATE post_publication_dirty_work SET lease_token = uuidv7(), leased_at = CURRENT_TIMESTAMP,
      lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second')
    WHERE id = $2 AND generation = $3 AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
    RETURNING id, post_identity_id, author_identity_id, community_identity_id, rss_feed_identity_id, topic_alias_identity_id, story_identity_id, reasons::text[] AS reasons,
      generation, cursor_post_id, pending_post_identity_id, pending_ancestor_post_identity_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at`,
    [leaseSeconds, work.id, work.generation],
  )
  return rows[0]
}
export async function updatePostPublicationDirtyWorkCursors(
  work: Pick<PostPublicationDirtyWork, 'id' | 'generation'> & { leaseToken: string },
  cursors: {
    postId?: string | null
    pendingPostId?: string | null
    pendingAncestorId?: string | null
    topicId?: string | null
    keyId?: string | null
  },
): Promise<boolean> {
  const updatesCursor =
    cursors.postId !== undefined ||
    cursors.pendingPostId !== undefined ||
    cursors.topicId !== undefined ||
    cursors.keyId !== undefined
  if (!updatesCursor) throw new TypeError('Post publication cursor update requires a cursor')
  if ((cursors.pendingPostId === undefined) !== (cursors.pendingAncestorId === undefined))
    throw new TypeError('Post publication pending ancestry cursors must update together')
  const statement = `/* updatePostPublicationDirtyWorkCursors */ UPDATE post_publication_dirty_work
    SET cursor_post_id = CASE WHEN $1 THEN $2::uuid ELSE cursor_post_id END,
      pending_post_identity_id = CASE WHEN $3 THEN $4::uuid ELSE pending_post_identity_id END,
      pending_ancestor_post_identity_id = CASE WHEN $3 THEN $5::uuid ELSE pending_ancestor_post_identity_id END,
      cursor_topic_id = CASE WHEN $6 THEN $7::uuid ELSE cursor_topic_id END,
      cursor_key_id = CASE WHEN $8 THEN $9::uuid ELSE cursor_key_id END,
      cursor_advanced_at = CURRENT_TIMESTAMP
    WHERE id = $10 AND generation = $11 AND lease_token = $12 AND lease_expires_at > CURRENT_TIMESTAMP`
  const values = [
    cursors.postId !== undefined,
    cursors.postId ?? null,
    cursors.pendingPostId !== undefined,
    cursors.pendingPostId ?? null,
    cursors.pendingAncestorId ?? null,
    cursors.topicId !== undefined,
    cursors.topicId ?? null,
    cursors.keyId !== undefined,
    cursors.keyId ?? null,
    work.id,
    work.generation,
    work.leaseToken,
  ]
  // The two resume pointers are entity relationships. Keep their retained
  // identity rows locked through the generation-fenced checkpoint so the
  // bounded bridge sweeper cannot reclaim an identity between insert and FK.
  if (cursors.pendingPostId && cursors.pendingAncestorId) {
    await using query = await beginTransaction()
    await retainPublicationIdentityBridges(query, 'post', [
      cursors.pendingPostId,
      cursors.pendingAncestorId,
    ])
    const { rowCount } = await query(statement, values)
    if (rowCount !== 1) return false
    await query.commit()
    return true
  }
  const { rowCount } = await write(statement, values)
  return rowCount === 1
}
export async function acknowledgePostPublicationDirtyWork(
  work: Pick<PostPublicationDirtyWork, 'id' | 'generation'> & { leaseToken: string },
): Promise<boolean> {
  const { rowCount } = await write(
    `/* acknowledgePostPublicationDirtyWork */ DELETE FROM post_publication_dirty_work
    WHERE id = $1 AND generation = $2 AND lease_token = $3 AND lease_expires_at > CURRENT_TIMESTAMP`,
    [work.id, work.generation, work.leaseToken],
  )
  return rowCount === 1
}
export async function renewPostPublicationDirtyWorkLease(
  work: Pick<PostPublicationDirtyWork, 'id' | 'generation'> & { leaseToken: string },
  leaseSeconds: number,
): Promise<boolean> {
  assertPositive(leaseSeconds)
  const { rowCount } = await write(
    `/* renewPostPublicationDirtyWorkLease */ UPDATE post_publication_dirty_work
    SET lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second')
    WHERE id = $2 AND generation = $3 AND lease_token = $4 AND lease_expires_at > CURRENT_TIMESTAMP`,
    [leaseSeconds, work.id, work.generation, work.leaseToken],
  )
  return rowCount === 1
}
export async function releasePostPublicationDirtyWorkLease(
  work: Pick<PostPublicationDirtyWork, 'id' | 'generation'> & { leaseToken: string },
): Promise<boolean> {
  const { rowCount } = await write(
    `/* releasePostPublicationDirtyWorkLease */ UPDATE post_publication_dirty_work
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = $1 AND generation = $2 AND lease_token = $3 AND lease_expires_at > CURRENT_TIMESTAMP`,
    [work.id, work.generation, work.leaseToken],
  )
  return rowCount === 1
}
function assertPositive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError('Post publication lease duration must be a positive integer')
}
