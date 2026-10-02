import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats, getManagedQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

app.route('/api/v1/mq/stats').get(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'GET:/api/v1/mq/stats',
  )

  ctx.json(await getManagedQueueStats(currentUser))
})
