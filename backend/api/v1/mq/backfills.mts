import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessQueueStats,
  listManagedBackfills,
  runManagedBackfill,
} from '@services/queue-monitoring'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

app.route('/api/v1/mq/backfills').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessQueueStats, 'GET:/api/v1/mq/backfills')
  ctx.json(listManagedBackfills())
})

app.route('/api/v1/mq/backfills/:id/runs').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/backfills/:id/runs',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/backfills/:id/runs', { path: ctx.params })
  ctx.json(await runManagedBackfill(currentUser, ctx.params.id!))
})
