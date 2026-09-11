import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanViewGrowthMetrics, getGrowthMetrics } from '@services/growth-metrics'
import type { GrowthRange } from '@services/growth-metrics/types'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'

const VALID_RANGES = new Set<GrowthRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: unknown): GrowthRange {
  if (typeof raw === 'string' && VALID_RANGES.has(raw as GrowthRange)) {
    return raw as GrowthRange
  }
  return '30d'
}

/**
 * GET /api/v1/growth-metrics — Platform growth KPIs for admin/investor dashboard.
 * Query params:
 *   ?range=today|7d|30d|90d|all  (default: 30d, invalid values fall back to 30d)
 */
app.route('/api/v1/growth-metrics').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanViewGrowthMetrics, 'GET:/api/v1/growth-metrics')

  const range = parseRange(ctx.query.range)
  const metrics = await getGrowthMetrics(range)

  ctx.json(metrics)
})
