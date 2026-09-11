import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import {
  getUnmappedRssFeedItemCategories,
  currentUserCanManageRssFeedCategories,
  type UnmappedCategoryStatus,
} from '@services/rss-feed-items'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'

const VALID_STATUSES = new Set<UnmappedCategoryStatus>(['pending', 'rejected', 'all'])

const parser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { default: 25, max: 100 },
})

/**
 * GET /api/v1/rss-feed-categories
 * List unmapped RSS feed item categories grouped by frequency.
 * Query params: status (pending|rejected|all, default: pending), limit, after
 */
app.route('/api/v1/rss-feed-categories').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageRssFeedCategories,
    'GET:/api/v1/rss-feed-categories',
  )

  const { limit, after } = parser.parse(ctx.query)

  const statusRaw = typeof ctx.query.status === 'string' ? ctx.query.status : 'pending'
  const status = VALID_STATUSES.has(statusRaw as UnmappedCategoryStatus)
    ? (statusRaw as UnmappedCategoryStatus)
    : 'pending'

  const { results, page_info } = await getUnmappedRssFeedItemCategories({ status, limit, after })
  ctx.json({ results, page_info })
})
