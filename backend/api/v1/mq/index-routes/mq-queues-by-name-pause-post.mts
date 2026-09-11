import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

import { findQueueByName } from './shared.mts'

app.route('/api/v1/mq/queues/:name/pause').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/pause',
  )

  const queue = findQueueByName(ctx.params.name!)
  ctx.assert(queue, 404, 'Queue not found')

  await queue!.pause()
  ctx.json({ success: true })
})
