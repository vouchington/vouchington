import type { TransactionQuery } from '@data-stores/psql'
import { uniquePublicationKeys } from './captured-keys.mts'
import { listHardDeletedPostPublicationKeys } from './capture-hard-delete-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'

// The caller's author-deletion drain already reassigned every authored post in this transaction
// (processAuthorDeletionPublicationBatch returned hasMore=false under the author lifecycle lock),
// so more survivors than this is a broken invariant. The capture must commit atomically with the
// user-row cascade, so it cannot be paged across transactions: fail and roll the purge back
// instead of capturing an unbounded set.
export const USER_CASCADE_CAPTURE_MAX_POSTS = 1000

/** Captures posts that a user-row cascade will destroy after author reassignment. */
export async function retainUserCascadeHardDeletedPosts(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `/* listUserCascadeHardDeletedPostIds */
    SELECT id FROM posts WHERE created_by_id = $1 ORDER BY id LIMIT $2`,
    [userId, USER_CASCADE_CAPTURE_MAX_POSTS + 1],
  )
  if (rows.length > USER_CASCADE_CAPTURE_MAX_POSTS) {
    throw new Error(
      `User cascade still owns more than ${USER_CASCADE_CAPTURE_MAX_POSTS} posts after the author deletion drain`,
    )
  }
  await retainHardDeletedPostPublication(
    query,
    rows.map(row => row.id),
  )
}

/** Captures every pre-delete key before the caller physically deletes these post roots. */
export async function retainHardDeletedPostPublication(
  query: TransactionQuery,
  rootPostIds: readonly string[],
): Promise<void> {
  const roots = [...new Set(rootPostIds.map(id => id.toLowerCase()))].toSorted()
  if (roots.length === 0) return
  const listed = await listHardDeletedPostPublicationKeys(query, roots)
  const keysByRoot = new Map(roots.map(rootId => [rootId, [] as (typeof listed)[number]['key'][]]))
  for (const { rootId, key } of listed) keysByRoot.get(rootId.toLowerCase())?.push(key)
  for (const rootId of roots) {
    enqueueCapturedPublicationChangeAfterCommit(query, {
      scope: { type: 'post', postId: rootId },
      reason: 'post_deleted',
      keys: uniquePublicationKeys(keysByRoot.get(rootId) ?? []),
    })
  }
}
