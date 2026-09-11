import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import { getBookmarksForEntity } from '@services/bookmarks/get'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type {
  EntityRelationEntityType,
  EntityRelationPredicateType,
} from '@services/entity-relations/config'
import { isUUID } from '@modules/utils'

app.route('/api/v1/bookmarks/:entityType/:entityId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/bookmarks/:entityType/:entityId')

  const { entityType, entityId } = ctx.params

  ctx.assert(isUUID(entityId!), 422, 'Invalid entity ID')

  // Validate entity type is bookmarkable
  const hasAnyBookmark = entityRelationMetadatum.some(
    r => r.subject_type === 'user' && r.object_type === entityType && r.is_bookmark,
  )
  ctx.assert(hasAnyBookmark, 422, 'Entity type cannot be bookmarked')

  const bookmarks = await getBookmarksForEntity(
    currentUser,
    entityType as EntityRelationEntityType,
    { id: entityId! },
  )

  ctx.json({ bookmarks })
})

app
  .route('/api/v1/bookmarks/:entityType/:entityId/:predicate')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PUT:/api/v1/bookmarks/:entityType/:entityId/:predicate',
    )

    const { entityType, entityId, predicate } = ctx.params

    ctx.assert(isUUID(entityId!), 422, 'Invalid entity ID')
    const entity = { id: entityId! }

    let relation
    try {
      relation = await bookmarkEntity(
        currentUser,
        entityType as EntityRelationEntityType,
        entity,
        predicate as EntityRelationPredicateType,
      )
    } catch (err: unknown) {
      // FK violation: entity does not exist
      if ((err as { code?: string }).code === '23503') ctx.throw(404, 'Entity not found')
      throw err
    }

    ctx.json({ bookmark: relation })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/bookmarks/:entityType/:entityId/:predicate',
    )

    const { entityType, entityId, predicate } = ctx.params

    ctx.assert(isUUID(entityId!), 422, 'Invalid entity ID')
    const entity = { id: entityId! }

    await unbookmarkEntity(
      currentUser,
      entityType as EntityRelationEntityType,
      entity,
      predicate as EntityRelationPredicateType,
    )

    ctx.setStatus(204)
  })
