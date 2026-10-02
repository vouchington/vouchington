import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import type { UpdatePostChanges } from './types.mts'
import {
  lockPostUpdatePublicationScopes,
  type AdditiveHashtagIntent,
} from './update/additive-hashtag.mts'

export function postUpdateMayAffectCategories(
  changes: UpdatePostChanges,
  hasAdditiveIntent: boolean,
): boolean {
  return (
    changes.title !== undefined ||
    changes.markdown !== undefined ||
    changes.categories !== undefined ||
    changes.structured_data !== undefined ||
    hasAdditiveIntent
  )
}

/** Locks the editor and owner fences in stable order; only the editor must still be active. */
export async function lockPostCategoryMutationUsers(
  query: TransactionQuery,
  postId: string,
  editorId: string,
  lockOwner: boolean,
): Promise<string | null> {
  const { rows } = lockOwner
    ? await query<{ created_by_id: string | null }>(sql`/* postCategoryOwner.beforeFences */
        SELECT created_by_id FROM posts WHERE id = ${postId}`)
    : { rows: [] as Array<{ created_by_id: string | null }> }
  const ownerId = rows[0]?.created_by_id ?? null
  const userIds = [...new Set([editorId, ...(ownerId ? [ownerId] : [])])].toSorted((a, b) =>
    a.localeCompare(b),
  )
  await query(sql`/* lockPostCategoryMutationUsers */
    SELECT pg_advisory_xact_lock(hashtextextended(ordered.user_id::text, 0))
    FROM (
      SELECT unnest(${userIds}::uuid[]) AS user_id
      ORDER BY user_id
    ) ordered
  `)
  await lockActiveUserSubjectsForMutation(query, [editorId])
  if (!ownerId) return null
  const owner = await query<{ id: string }>(sql`/* postCategoryOwner.activeFence */
    SELECT id FROM users WHERE id = ${ownerId} AND deleted_at IS NULL`)
  return owner.rows[0]?.id ?? null
}

export async function lockPostUpdateMutationScopes(
  query: TransactionQuery,
  postId: string,
  editorId: string,
  changes: UpdatePostChanges,
  additiveIntent?: AdditiveHashtagIntent,
): Promise<string | null> {
  const ownerId = await lockPostCategoryMutationUsers(
    query,
    postId,
    editorId,
    postUpdateMayAffectCategories(changes, !!additiveIntent),
  )
  await lockPostUpdatePublicationScopes(query, postId, additiveIntent)
  return ownerId
}
