import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanViewModerationTransparency,
  getModerationTransparency,
  type ModerationAnalyticsRange,
} from '@services/moderation-analytics'
import { defineQueryContract, queryEnum, queryString } from '@modules/pagination'
import { apiQuery } from '../response-contract.mts'
import { requireAuth } from '../response-helpers.mts'

const RANGE_VALUES = ['today', '7d', '30d', '90d', 'all'] as const
const VALID_RANGES = new Set<ModerationAnalyticsRange>(RANGE_VALUES)
const rangeQuery = defineQueryContract({
  range: queryEnum(RANGE_VALUES, {
    default: '30d',
    description: 'Aggregate window; invalid or omitted values use 30d.',
  }),
  after: queryString({
    description: 'Opaque continuation cursor for an older all-time monthly page.',
  }),
})

app.route('/api/v1/moderation-transparency').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/moderation-transparency')
  ctx.assert(await currentUserCanViewModerationTransparency(currentUser), 403, 'Forbidden')
  apiQuery('GET:/api/v1/moderation-transparency', rangeQuery)
  const range = parseRange(ctx.query.range)
  ctx.json(
    await getModerationTransparency(range, new Date(), getAfter(ctx, ctx.query.after, range)),
  )
})

function parseRange(raw: unknown): ModerationAnalyticsRange {
  if (typeof raw === 'string' && VALID_RANGES.has(raw as ModerationAnalyticsRange)) {
    return raw as ModerationAnalyticsRange
  }
  return '30d'
}

function getAfter(ctx: Context, raw: unknown, range: ModerationAnalyticsRange): string | undefined {
  if (range !== 'all' || raw === undefined) return undefined
  ctx.assert(typeof raw === 'string', 400, 'Invalid moderation transparency cursor')
  return raw
}
