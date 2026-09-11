import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, getAggregatedQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

import { QUEUE_NAMES } from './shared.mts'

app.route('/api/v1/mq/stats').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessQueueStats, 'GET:/api/v1/mq/stats')

  const stats = await getAggregatedQueueStats(QUEUE_NAMES)
  ctx.json({ stats })
})
