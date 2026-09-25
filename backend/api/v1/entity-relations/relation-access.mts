import type { Context } from '@jongleberry/api-server'
import type { EntityRelationMetadata, EntityRelationViewer } from '@services/entity-relations'
import { getRelatablePostIds } from '@services/entity-relations/post-access'
import { isUUID } from '@modules/utils'

/**
 * 404s unless the viewer may read every post a new relation would name, so relating content
 * cannot confirm that a private or pending post exists. Authors may relate content to their own
 * pending posts. The check uses the same filters as the write's read-back.
 */
export async function assertCanViewRelatedPosts(
  ctx: Context,
  viewer: EntityRelationViewer,
  metadata: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
): Promise<void> {
  const subjectIds = metadata.subject_type === 'post' ? [subjectId] : []
  const objectPostIds = metadata.object_type === 'post' ? objectIds : []
  if (subjectIds.length === 0 && objectPostIds.length === 0) return
  ctx.assert(
    [...subjectIds, ...objectPostIds].every(id => isUUID(id)),
    404,
    'Not found',
  )
  const relatable = await getRelatablePostIds(viewer, { subjectIds, objectIds: objectPostIds })
  ctx.assert(
    subjectIds.every(id => relatable.subjectIds.has(id)) &&
      objectPostIds.every(id => relatable.objectIds.has(id)),
    404,
    'Not found',
  )
}
