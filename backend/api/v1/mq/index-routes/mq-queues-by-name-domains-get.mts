import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, listManagedQueueDomains } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues/:name/domains').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'GET:/api/v1/mq/queues/:name/domains',
  )
  validateRequestContract(ctx, 'GET:/api/v1/mq/queues/:name/domains', { path: ctx.params })
  ctx.json(await listManagedQueueDomains(ctx.params.name!))
})
