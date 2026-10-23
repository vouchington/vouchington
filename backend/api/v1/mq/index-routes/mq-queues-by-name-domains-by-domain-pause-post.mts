import { isHttpError } from 'http-errors'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessQueueStats,
  setManagedQueueDomainPaused,
} from '@services/queue-monitoring'
import app from '../../../app.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
} from '../../../response-helpers.mts'

type PauseQueueDomainRequest = { reason?: string | null }

app.route('/api/v1/mq/queues/:name/domains/:domain/pause').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/queues/:name/domains/:domain/pause',
  )
  // The note is optional, so an empty body pauses without one.
  const body = (await parseJsonBody(ctx, '10kb').catch(err => {
    if (isHttpError(err) && err.status === 422) throw err
    return {}
  })) as PauseQueueDomainRequest
  validateRequestContract(ctx, 'POST:/api/v1/mq/queues/:name/domains/:domain/pause', {
    path: ctx.params,
    body,
  })
  ctx.json(
    await setManagedQueueDomainPaused(currentUser, ctx.params.name!, ctx.params.domain!, {
      paused: true,
      reason: body.reason,
    }),
  )
})
