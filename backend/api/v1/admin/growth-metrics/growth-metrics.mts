import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanViewGrowthMetrics, getGrowthMetrics } from '@services/growth-metrics'
import { parseGrowthMetricsRange } from '@services/growth-metrics/parse-range'
import type { GrowthRange } from '@services/growth-metrics/types'
import { defineQueryContract, queryEnum } from '@modules/pagination'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../../response-contract.mts'

const RANGE_VALUES = ['today', '7d', '30d', '90d', 'all'] as const satisfies readonly GrowthRange[]
const rangeQuery = defineQueryContract({
  range: queryEnum(RANGE_VALUES, {
    default: '30d',
    description: 'Growth window; invalid or omitted values use 30d.',
  }),
})

/**
 * GET /api/v1/growth-metrics — Platform growth KPIs for admin/investor dashboard.
 * Query params:
 *   ?range=today|7d|30d|90d|all  (default: 30d, invalid values fall back to 30d)
 */
app.route('/api/v1/growth-metrics').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/growth-metrics', rangeQuery)
  await requireAuthAndRateLimit(ctx, currentUserCanViewGrowthMetrics, 'GET:/api/v1/growth-metrics')

  // An invalid range falls back to 30d instead of failing, so the contract checks the settled value.
  const range = parseGrowthMetricsRange(ctx.query.range)
  validateRequestContract(ctx, 'GET:/api/v1/growth-metrics', { query: { range } })
  const metrics = await getGrowthMetrics(range)

  ctx.json(apiResponse('GET:/api/v1/growth-metrics', metrics))
})
