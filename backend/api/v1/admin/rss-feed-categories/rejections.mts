import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  rejectRssFeedItemCategory,
  unrejectRssFeedItemCategory,
  currentUserCanManageRssFeedCategories,
} from '@services/rss-feed-items'
import { requireAuthAndRateLimit, parseJsonBody } from '../../../response-helpers.mts'

type RejectionBody = { category_text?: unknown }

/**
 * POST /api/v1/rss-feed-categories/rejections
 * Reject an unmapped category (hide from pending queue).
 */
app.route('/api/v1/rss-feed-categories/rejections').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageRssFeedCategories,
    'POST:/api/v1/rss-feed-categories/rejections',
  )
  const body = await parseJsonBody<RejectionBody>(ctx)
  ctx.assert(
    typeof body.category_text === 'string' && body.category_text.trim(),
    422,
    'category_text is required',
  )
  await rejectRssFeedItemCategory(currentUser, body.category_text as string)
  ctx.setStatus(201)
  ctx.json({ ok: true })
})

/**
 * DELETE /api/v1/rss-feed-categories/rejections
 * Un-reject a category (restore to pending queue).
 */
app.route('/api/v1/rss-feed-categories/rejections').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageRssFeedCategories,
    'DELETE:/api/v1/rss-feed-categories/rejections',
  )
  const body = await parseJsonBody<RejectionBody>(ctx)
  ctx.assert(
    typeof body.category_text === 'string' && body.category_text.trim(),
    422,
    'category_text is required',
  )
  await unrejectRssFeedItemCategory(currentUser, body.category_text as string)
  ctx.setStatus(204)
})
