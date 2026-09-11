import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { getModerationAnalytics } from '@services/moderation-analytics'
import type { ModerationAnalyticsRange } from '@services/moderation-analytics/types'
import { isAdminUser } from '@services/users'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'

const VALID_RANGES = new Set<ModerationAnalyticsRange>(['today', '7d', '30d', '90d', 'all'])

function parseRange(raw: unknown): ModerationAnalyticsRange {
  if (typeof raw === 'string' && VALID_RANGES.has(raw as ModerationAnalyticsRange)) {
    return raw as ModerationAnalyticsRange
  }
  return '30d'
}

app.route('/api/v1/admin/moderation-analytics').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'GET:/api/v1/admin/moderation-analytics')

  const range = parseRange(ctx.query.range)
  const metrics = await getModerationAnalytics(range, { type: 'global' })

  metrics.moderator_workload.users = await getModeratorUsers(
    metrics.moderator_workload.moderators.map(m => m.actor_id),
  )

  ctx.json(metrics)
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
