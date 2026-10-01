import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { getModerationAnalytics } from '@services/moderation-analytics'
import type { ModerationAnalyticsRange } from '@services/moderation-analytics/types'
import { isAdminUser } from '@services/users'
import { defineQueryContract, queryEnum } from '@modules/pagination'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../../response-contract.mts'

const RANGE_VALUES = [
  'today',
  '7d',
  '30d',
  '90d',
  'all',
] as const satisfies readonly ModerationAnalyticsRange[]
const VALID_RANGES = new Set<ModerationAnalyticsRange>(RANGE_VALUES)
const rangeQuery = defineQueryContract({
  range: queryEnum(RANGE_VALUES, {
    default: '30d',
    description: 'Aggregate window; invalid or omitted values use 30d.',
  }),
})

function parseRange(raw: unknown): ModerationAnalyticsRange {
  if (typeof raw === 'string' && VALID_RANGES.has(raw as ModerationAnalyticsRange)) {
    return raw as ModerationAnalyticsRange
  }
  return '30d'
}

app.route('/api/v1/admin/moderation-analytics').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/admin/moderation-analytics', rangeQuery)
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/moderation-analytics')

  // An invalid range falls back to 30d instead of failing, so the contract checks the settled value.
  const range = parseRange(ctx.query.range)
  validateRequestContract(ctx, 'GET:/api/v1/admin/moderation-analytics', { query: { range } })
  const metrics = await getModerationAnalytics(range, { type: 'global' })

  metrics.moderator_workload.users = await getModeratorUsers(
    metrics.moderator_workload.moderators.map(m => m.actor_id),
  )

  ctx.json(apiResponse('GET:/api/v1/admin/moderation-analytics', metrics))
})

function getModeratorUsers(actorIds: string[]): Promise<Record<string, unknown>> {
  if (actorIds.length === 0) return Promise.resolve({})

  return getUserPublicByAnyCachedBatch(actorIds).then(users =>
    users.reduce<Record<string, unknown>>((acc, user) => {
      if (user) acc[user.id] = user
      return acc
    }, {}),
  )
}
