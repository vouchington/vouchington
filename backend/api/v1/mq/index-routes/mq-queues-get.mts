import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, listManagedQueues } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessQueueStats, 'GET:/api/v1/mq/queues')
  ctx.json(await listManagedQueues())
})
