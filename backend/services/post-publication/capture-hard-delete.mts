import type { TransactionQuery } from '@data-stores/psql'
import {
  listHardDeletedPostPublicationKeys,
  retainHardDeletedPostPublicationKeys,
} from './capture-hard-delete-keys.mts'
import { recordPostPublicationChanges } from './capture-posts.mts'

/** Captures posts the user-row cascade will destroy after author reassignment. */
export async function retainUserCascadeHardDeletedPosts(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `/* listUserCascadeHardDeletedPostIds */
    -- no-mistakes-disable-next-line postgres-required-predicates: remaining authored posts are keyed by created_by_id across id partitions; see #3336
    SELECT id FROM posts WHERE created_by_id = $1 ORDER BY id`,
    [userId],
  )
  await retainHardDeletedPostPublication(
    query,
    rows.map(row => row.id),
  )
}

/**
 * Locks the doomed roots, then reads subtree impact keys and unreceived identity keys.
 * The read stays after the advisory lock so it sees the previous lock holder's commit.
 */
export async function retainHardDeletedPostPublication(
  query: TransactionQuery,
  rootPostIds: readonly string[],
): Promise<void> {
  const roots = [...new Set(rootPostIds.map(id => id.toLowerCase()))].toSorted()
  if (roots.length === 0) return
  const work = await recordPostPublicationChanges(
    query,
    'post_deleted',
    roots.map(postId => ({ postId })),
  )
  await retainLockedHardDeletedPostPublicationKeys(
    query,
    roots,
    new Map(
      work.flatMap(row =>
        row.post_identity_id ? [[row.post_identity_id.toLowerCase(), row.id] as const] : [],
      ),
    ),
  )
}

async function retainLockedHardDeletedPostPublicationKeys(
  query: TransactionQuery,
  roots: readonly string[],
  workIdByRoot: ReadonlyMap<string, string>,
): Promise<void> {
  const listed = await listHardDeletedPostPublicationKeys(query, roots)
  await retainHardDeletedPostPublicationKeys(
    query,
    listed.flatMap(row => {
      const dirtyWorkId = workIdByRoot.get(row.rootId)
      return dirtyWorkId ? [{ dirtyWorkId, key: row.key }] : []
    }),
  )
}
