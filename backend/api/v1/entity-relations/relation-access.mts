import type { Context } from '@jongleberry/api-server'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import { canViewPostsBatch } from '@services/posts'
import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'

/**
 * 404s unless the viewer can read every post a new relation would touch, so relating content
 * cannot confirm that a private or pending post exists.
 */
export async function assertCanViewRelatedPosts(
  ctx: Context,
  currentUser: PrivateUser,
  metadata: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
): Promise<void> {
  const postIds = [
    ...(metadata.subject_type === 'post' ? [subjectId] : []),
    ...(metadata.object_type === 'post' ? objectIds : []),
  ]
  if (postIds.length === 0) return
  ctx.assert(
    postIds.every(id => isUUID(id)),
    404,
    'Not found',
  )
  const visible = await canViewPostsBatch(
    currentUser,
    postIds.map(id => ({ id })),
  )
  ctx.assert(
    postIds.every(id => visible.get(id)),
    404,
    'Not found',
  )
}
