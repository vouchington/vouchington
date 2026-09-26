import { write } from '@data-stores/psql'
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
    SELECT id, post_id, author_user_id, community_id, rss_feed_id, topic_alias_id, story_id, reasons,
      generation, cursor_post_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at
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
    RETURNING id, post_id, author_user_id, community_id, rss_feed_id, topic_alias_id, story_id, reasons,
      generation, cursor_post_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at`,
    [leaseSeconds, work.id, work.generation],
  )
  return rows[0]
}
export async function updatePostPublicationDirtyWorkCursors(
  work: Pick<PostPublicationDirtyWork, 'id' | 'generation'> & { leaseToken: string },
  cursors: { postId?: string | null; topicId?: string | null; keyId?: string | null },
): Promise<boolean> {
  const updatesCursor =
    cursors.postId !== undefined || cursors.topicId !== undefined || cursors.keyId !== undefined
  if (!updatesCursor) throw new TypeError('Post publication cursor update requires a cursor')
  const { rowCount } = await write(
    `/* updatePostPublicationDirtyWorkCursors */ UPDATE post_publication_dirty_work
    SET cursor_post_id = CASE WHEN $1 THEN $2::uuid ELSE cursor_post_id END,
      cursor_topic_id = CASE WHEN $3 THEN $4::uuid ELSE cursor_topic_id END,
      cursor_key_id = CASE WHEN $5 THEN $6::uuid ELSE cursor_key_id END,
      cursor_updated_at = CURRENT_TIMESTAMP
    WHERE id = $7 AND generation = $8 AND lease_token = $9 AND lease_expires_at > CURRENT_TIMESTAMP`,
    [
      cursors.postId !== undefined,
      cursors.postId ?? null,
      cursors.topicId !== undefined,
      cursors.topicId ?? null,
      cursors.keyId !== undefined,
      cursors.keyId ?? null,
      work.id,
      work.generation,
      work.leaseToken,
    ],
  )
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
