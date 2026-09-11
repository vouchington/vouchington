import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import '../scheduled-jobs.mts'

import { findQueueByName } from './shared.mts'

app.route('/api/v1/mq/queues/:name/resume').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/resume',
  )

  const queue = findQueueByName(ctx.params.name!)
  ctx.assert(queue, 404, 'Queue not found')

  await queue!.resume()
  ctx.json({ success: true })
})
