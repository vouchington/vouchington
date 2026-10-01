import { assertPostMutationAccess } from '@services/entity-relations/post-access'
import type { UpsertEntityRelationOptions } from '@services/entity-relations/upsert'
import { entityRelationViewerFor } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { EntityRelationActionAuthority } from './create.mts'

/** The state-dependent recheck a write runs inside its own transaction. */
export type PostTargetGuard = NonNullable<UpsertEntityRelationOptions['postMutationGuard']>

/**
 * Authorizes naming one post as the target of a write. Ordinary existence and visibility come
 * first, so a hidden post is never disclosed. A delegated credential then needs the exact
 * `post-relations.owned-private:write` grant, and must own the post and its root, to reach a
 * private post. Returns the same check for a write that repeats it once its locks are held.
 */
export async function assertPostTargetAccess(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  postId: string,
): Promise<PostTargetGuard> {
  const viewer = entityRelationViewerFor(currentUser)
  const posts = { subjectIds: [], objectIds: [postId] }
  const rootIds = await assertPostMutationAccess(viewer, authority, posts)
  return {
    postIds: [postId, ...rootIds.values()],
    assertAllowed: query =>
      assertPostMutationAccess(viewer, authority, posts, { query }, rootIds).then(() => undefined),
  }
}
