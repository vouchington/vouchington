import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, getAllQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

import { QUEUE_NAMES } from './shared.mts'

app.route('/api/v1/mq/queues').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessQueueStats, 'GET:/api/v1/mq/queues')

  const queues = await getAllQueueStats(QUEUE_NAMES)
  ctx.json({
    queues,
    total: queues.length,
  })
})
