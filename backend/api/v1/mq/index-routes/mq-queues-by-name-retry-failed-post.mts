import { recordStaffOperation } from '@services/moderator-actions'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

import { findQueueByName } from './shared.mts'

app.route('/api/v1/mq/queues/:name/retry-failed').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/retry-failed',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/retry-failed', { path: ctx.params })

  const queue = findQueueByName(ctx.params.name!)
  ctx.assert(queue, 404, 'Queue not found')

  const result = await recordStaffOperation(
    currentUser.id,
    { actionType: 'queue_retry_failed', queueName: queue!.name },
    async () => {
      const failedJobs = await queue!.getJobs('failed', 0, 99)
      const results = await Promise.allSettled(failedJobs.map(job => job.retry()))
      return {
        attempted: results.length,
        retried: results.filter(r => r.status === 'fulfilled').length,
      }
    },
    result => ({ after: result }),
  )

  ctx.json({ success: true, retried: result.retried })
})
