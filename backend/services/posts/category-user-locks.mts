import { runSequentially } from '@modules/utils/run-sequentially'
import { assertDelegatedPostActorActive } from './authorization.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { lockDelegatedPostThread } from './delegated-write-locks.mts'
import sql from 'sql-template-strings'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import type { UpdatePostChanges } from './types.mts'
import type { PostHashtagIntent } from './update/hashtag-intent.mts'

function postUpdateMayAffectCategories(
  changes: UpdatePostChanges,
  hasHashtagIntent: boolean,
): boolean {
  return (
    changes.title !== undefined ||
    changes.markdown !== undefined ||
    changes.categories !== undefined ||
    changes.structured_data !== undefined ||
    hasHashtagIntent
  )
}

export async function lockPostUpdateMutationScopes(
  query: TransactionQuery,
  postId: string,
  editorId: string,
  changes: UpdatePostChanges,
  hashtagIntent?: PostHashtagIntent,
  delegated = false,
): Promise<string | null> {
  // lock-reason: prevents: committing an owned post edit after its editor crosses the deletion fence; writer: post edits and account deletion.
  await lockActiveUserSubjectsForMutation(query, [editorId])
  const { rows } = postUpdateMayAffectCategories(changes, !!hashtagIntent)
    ? await query<{ created_by_id: string | null }>(sql`/* postCategoryOwner */
        SELECT created_by_id FROM posts WHERE id = ${postId}`)
    : { rows: [] }
  if (delegated) {
    await runSequentially([
      () => assertDelegatedPostActorActive(editorId, { query }),
      () => lockDelegatedPostThread(query, postId),
    ])
  }
  return rows[0]?.created_by_id ?? null
}
