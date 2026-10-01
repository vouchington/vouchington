import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanViewAiCosts, getCommunityAiCostTotals } from '@services/ai-usage'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { aiCostTotalsParser as parser } from '@services/ai-usage/query-parser'
import { apiQuery } from '../../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../../validate-paginated-query.mts'

app.route('/api/v1/admin/ai-costs').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanViewAiCosts, 'GET:/api/v1/admin/ai-costs')

  apiQuery('GET:/api/v1/admin/ai-costs', parser)
  const options = parseAndValidatePaginatedRequest(ctx, 'GET:/api/v1/admin/ai-costs', parser)
  ctx.json(await getCommunityAiCostTotals(options))
})
