import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createPaginationParser, defineQueryContract, queryEnum } from '@modules/pagination'
import {
  getUnmappedRssFeedItemCategories,
  currentUserCanManageRssFeedCategories,
  type UnmappedCategoryStatus,
} from '@services/rss-feed-items'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../../validate-paginated-query.mts'

const STATUS_VALUES = [
  'pending',
  'rejected',
  'all',
] as const satisfies readonly UnmappedCategoryStatus[]
const VALID_STATUSES = new Set<UnmappedCategoryStatus>(STATUS_VALUES)
const statusQuery = defineQueryContract({
  status: queryEnum(STATUS_VALUES, {
    default: 'pending',
    description: 'Category status; unknown values use pending.',
  }),
})

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
  apiQuery('GET:/api/v1/rss-feed-categories', parser, statusQuery)
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageRssFeedCategories,
    'GET:/api/v1/rss-feed-categories',
  )

  // Unknown `status` values fall back to pending instead of failing, so the raw value is left out
  // of the contract check and the settled status below is always valid.
  const { limit, after } = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/rss-feed-categories',
    parser,
    { extraQueryContracts: [statusQuery.queryContract], ignoredKeys: ['status'] },
  )

  const statusRaw = typeof ctx.query.status === 'string' ? ctx.query.status : 'pending'
  const status = VALID_STATUSES.has(statusRaw as UnmappedCategoryStatus)
    ? (statusRaw as UnmappedCategoryStatus)
    : 'pending'

  const { results, page_info } = await getUnmappedRssFeedItemCategories({ status, limit, after })
  ctx.json(apiResponse('GET:/api/v1/rss-feed-categories', { results, page_info }))
})
