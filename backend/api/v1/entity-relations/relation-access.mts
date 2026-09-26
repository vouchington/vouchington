import type { Context } from '@jongleberry/api-server'
import type { EntityRelationMetadata, EntityRelationViewer } from '@services/entity-relations'
import { assertRelatablePostAccess } from '@services/entity-relations/post-access'

/** Route adapter retained for election-vote access; mutation orchestration uses the shared service. */
export async function assertCanViewRelatedPosts(
  ctx: Context,
  viewer: EntityRelationViewer,
  metadata: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
): Promise<void> {
  const subjectIds = metadata.subject_type === 'post' ? [subjectId] : []
  const objectPostIds = metadata.object_type === 'post' ? objectIds : []
  try {
    await assertRelatablePostAccess(viewer, { subjectIds, objectIds: objectPostIds })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) ctx.throw(404, 'Not found')
    throw error
  }
}
