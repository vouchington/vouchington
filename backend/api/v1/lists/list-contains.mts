import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { isUUID } from '@modules/utils'
import { getListsContainingEntity, type ListItemType } from '@services/lists'

const VALID_ITEM_TYPES = new Set<ListItemType>(['rss_feed_item', 'post'])

app.route('/api/v1/lists/contains').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/lists/contains')

  const item_type = ctx.query.item_type as string | undefined
  const entity_id = ctx.query.entity_id as string | undefined

  ctx.assert(
    item_type && VALID_ITEM_TYPES.has(item_type as ListItemType),
    422,
    'item_type must be rss_feed_item or post',
  )
  ctx.assert(entity_id, 422, 'entity_id is required')
  ctx.assert(isUUID(entity_id), 422, 'entity_id must be a valid UUID')

  const list_ids = await getListsContainingEntity(
    currentUser.id,
    item_type as ListItemType,
    entity_id,
  )

  ctx.json({ list_ids })
})
