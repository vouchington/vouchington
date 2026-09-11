import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanViewAiCosts, getCommunityAiCostTotals } from '@services/ai-usage'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { createPaginationParser } from '@modules/pagination'
import { apiQuery } from '../../../response-contract.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

app.route('/api/v1/admin/ai-costs').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanViewAiCosts, 'GET:/api/v1/admin/ai-costs')

  apiQuery('GET:/api/v1/admin/ai-costs', parser)
  ctx.json(await getCommunityAiCostTotals(parser.parse(ctx.query)))
})
