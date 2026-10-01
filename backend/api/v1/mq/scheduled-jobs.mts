import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessQueueStats,
  listManagedScheduledJobs,
  runManagedScheduledJob,
} from '@services/queue-monitoring'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

app.route('/api/v1/mq/scheduled-jobs').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'GET:/api/v1/mq/scheduled-jobs',
  )
  ctx.json(listManagedScheduledJobs())
})

app.route('/api/v1/mq/scheduled-jobs/:id/runs').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/scheduled-jobs/:id/runs',
  )
  validateRequestContract(ctx, 'POST:/api/v1/mq/scheduled-jobs/:id/runs', { path: ctx.params })
  ctx.json(await runManagedScheduledJob(currentUser, ctx.params.id!))
})
