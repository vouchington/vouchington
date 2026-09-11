import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { BACKFILL_REGISTRY } from './backfills-registry.mts'

// GET /api/v1/mq/backfills - List all triggerable backfills
app.route('/api/v1/mq/backfills').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessQueueStats, 'GET:/api/v1/mq/backfills')

  const backfills = BACKFILL_REGISTRY.map(({ trigger: _, ...backfill }) => backfill)
  ctx.json({ backfills })
})

// POST /api/v1/mq/backfills/:id/runs - Manually trigger a backfill
app.route('/api/v1/mq/backfills/:id/runs').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/backfills/:id/runs',
  )

  const backfill = BACKFILL_REGISTRY.find(b => b.id === ctx.params.id)
  ctx.assert(backfill, 404, 'Backfill not found')

  await backfill!.trigger()
  ctx.json({ success: true })
})
