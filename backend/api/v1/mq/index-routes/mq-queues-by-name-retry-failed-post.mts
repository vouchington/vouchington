import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessQueueStats,
  retryManagedQueueFailedJobs,
} from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues/:name/retry-failed').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/retry-failed',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/retry-failed', { path: ctx.params })
  ctx.json(await retryManagedQueueFailedJobs(currentUser, ctx.params.name!))
})
