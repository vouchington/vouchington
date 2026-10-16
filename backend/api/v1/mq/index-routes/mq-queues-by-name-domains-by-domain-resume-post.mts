import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessQueueStats,
  setManagedQueueDomainPaused,
} from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/mq/queues/:name/domains/:domain/resume').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/domains/:domain/resume',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/domains/:domain/resume', {
    path: ctx.params,
  })
  ctx.json(
    await setManagedQueueDomainPaused(currentUser, ctx.params.name!, ctx.params.domain!, {
      paused: false,
    }),
  )
})
