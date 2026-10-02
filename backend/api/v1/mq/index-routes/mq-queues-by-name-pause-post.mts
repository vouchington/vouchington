import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, setManagedQueuePaused } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues/:name/pause').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/pause',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/pause', { path: ctx.params })
  ctx.json(await setManagedQueuePaused(currentUser, ctx.params.name!, true))
})
