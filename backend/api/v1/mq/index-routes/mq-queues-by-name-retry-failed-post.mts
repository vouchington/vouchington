import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

import { findQueueByName } from './shared.mts'

app.route('/api/v1/mq/queues/:name/retry-failed').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/retry-failed',
  )

  const queue = findQueueByName(ctx.params.name!)
  ctx.assert(queue, 404, 'Queue not found')

  const failedJobs = await queue!.getJobs('failed', 0, 99)
  const results = await Promise.allSettled(failedJobs.map(job => job.retry()))
  const retried = results.filter(r => r.status === 'fulfilled').length

  ctx.json({ success: true, retried })
})
