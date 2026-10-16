import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessQueueStats,
  retryManagedQueueDomainFailedJobs,
} from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues/:name/domains/:domain/retry-failed').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/domains/:domain/retry-failed',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/domains/:domain/retry-failed', {
    path: ctx.params,
  })
  ctx.json(
    await retryManagedQueueDomainFailedJobs(currentUser, ctx.params.name!, ctx.params.domain!),
  )
})
