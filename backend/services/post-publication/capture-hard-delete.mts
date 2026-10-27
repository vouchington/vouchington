import type { TransactionQuery } from '@data-stores/psql'
import { uniquePublicationKeys } from './captured-keys.mts'
import { listHardDeletedPostPublicationKeys } from './capture-hard-delete-keys.mts'
import { lockPostPublicationPostScopes } from './capture-posts.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'

/** Captures posts that a user-row cascade will destroy after author reassignment. */
export async function retainUserCascadeHardDeletedPosts(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `/* listUserCascadeHardDeletedPostIds */
    -- no-mistakes-disable-next-line postgres-required-predicates: remaining authored posts span id partitions; see #3336
    SELECT id FROM posts WHERE created_by_id = $1 ORDER BY id`,
    [userId],
  )
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
  await lockPostPublicationPostScopes(query, roots)
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
