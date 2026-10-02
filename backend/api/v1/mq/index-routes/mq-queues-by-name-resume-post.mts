import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, setManagedQueuePaused } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues/:name/resume').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/resume',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/resume', { path: ctx.params })
  ctx.json(await setManagedQueuePaused(currentUser, ctx.params.name!, false))
})
