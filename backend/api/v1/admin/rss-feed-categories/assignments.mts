import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  assignRssFeedItemCategoryToTopic,
  currentUserCanManageRssFeedCategories,
} from '@services/rss-feed-items'
import {
  requireAuthAndRateLimit,
  parseJsonBody,
  validateRequestContract,
} from '../../../response-helpers.mts'
import type { ApiUuidContract } from '../../../request-contract-types.mts'

type AssignmentBody = { category_text: string; topic_id: ApiUuidContract }

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
  validateRequestContract(ctx, 'POST:/api/v1/rss-feed-categories/assignments', { body })
  ctx.assert(body.category_text.trim(), 422, 'category_text is required')
  const { updated } = await assignRssFeedItemCategoryToTopic(currentUser, {
    categoryText: body.category_text,
    topicId: body.topic_id,
  })
  ctx.json({ updated })
})
