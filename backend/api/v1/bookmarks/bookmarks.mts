import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { getBookmarksForEntity } from '@services/bookmarks/get'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type { EntityRelationEntityType } from '@services/entity-relations/config'
import { isUUID } from '@modules/utils'
import {
  deleteBookmarkAction,
  upsertBookmarkAction,
} from '@services/entity-relation-actions/bookmark'

app.route('/api/v1/bookmarks/:entityType/:entityId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/bookmarks/:entityType/:entityId')

  validateRequestContract(ctx, 'GET:/api/v1/bookmarks/:entityType/:entityId', {
    path: ctx.params,
  })
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
    assertNotSuspended(currentUser)

    validateRequestContract(ctx, 'PUT:/api/v1/bookmarks/:entityType/:entityId/:predicate', {
      path: ctx.params,
    })
    const { entityType, entityId, predicate } = ctx.params

    const bookmark = await upsertBookmarkAction(
      currentUser,
      { kind: 'first_party' },
      { entityType: entityType!, entityId: entityId!, predicate: predicate! },
    )

    ctx.json({ bookmark })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/bookmarks/:entityType/:entityId/:predicate',
    )
    assertNotSuspended(currentUser)

    validateRequestContract(ctx, 'DELETE:/api/v1/bookmarks/:entityType/:entityId/:predicate', {
      path: ctx.params,
    })
    const { entityType, entityId, predicate } = ctx.params

    await deleteBookmarkAction(currentUser, {
      entityType: entityType!,
      entityId: entityId!,
      predicate: predicate!,
    })

    ctx.setStatus(204)
  })
