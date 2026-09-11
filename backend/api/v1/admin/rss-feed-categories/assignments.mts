import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  assignRssFeedItemCategoryToTopic,
  currentUserCanManageRssFeedCategories,
} from '@services/rss-feed-items'
import { requireAuthAndRateLimit, parseJsonBody } from '../../../response-helpers.mts'
import { isUUID } from '@modules/utils'

type AssignmentBody = { category_text?: unknown; topic_id?: unknown }

/**
 * POST /api/v1/rss-feed-categories/assignments
 * Assign an unmapped category as an alias of an existing topic.
 * Returns { updated: number } — count of feed item categories backfilled.
 */
app.route('/api/v1/rss-feed-categories/assignments').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageRssFeedCategories,
    'POST:/api/v1/rss-feed-categories/assignments',
  )
  const body = await parseJsonBody<AssignmentBody>(ctx)
  ctx.assert(
    typeof body.category_text === 'string' && body.category_text.trim(),
    422,
    'category_text is required',
  )
  ctx.assert(typeof body.topic_id === 'string' && body.topic_id.trim(), 422, 'topic_id is required')
  ctx.assert(isUUID(body.topic_id as string), 422, 'topic_id must be a valid UUID')
  const { updated } = await assignRssFeedItemCategoryToTopic(currentUser, {
    categoryText: body.category_text as string,
    topicId: body.topic_id as string,
  })
  ctx.json({ updated })
})
