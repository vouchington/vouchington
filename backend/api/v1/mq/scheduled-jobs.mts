import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { SCHEDULED_JOBS_REGISTRY } from './scheduled-jobs-registry.mts'

// GET /api/v1/mq/scheduled-jobs - List all triggerable scheduled jobs
app.route('/api/v1/mq/scheduled-jobs').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'GET:/api/v1/mq/scheduled-jobs',
  )

  const jobs = SCHEDULED_JOBS_REGISTRY.map(({ trigger: _, ...job }) => job)
  ctx.json({ jobs })
})

// POST /api/v1/mq/scheduled-jobs/:id/runs - Manually trigger a scheduled job
app.route('/api/v1/mq/scheduled-jobs/:id/runs').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanAccessQueueStats,
    'POST:/api/v1/mq/scheduled-jobs/:id/runs',
  )

  const job = SCHEDULED_JOBS_REGISTRY.find(j => j.id === ctx.params.id)
  ctx.assert(job, 404, 'Scheduled job not found')

  await job!.trigger()
  ctx.json({ success: true })
})
