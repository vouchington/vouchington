import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanAccessPsqlAdmin } from '@services/psql-admin/authorization'
import { getMigrationStatus } from '@services/psql-admin'
import { getPartitionStatus } from '@services/psql-admin/partitions'
import {
  enqueueRunMigrations,
  enqueueRunViews,
  enqueueRunConfigDriven,
  enqueueCreatePartitions,
  enqueueCleanupPartitions,
} from '@queues/psql/enqueues'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { PSQL_ADMIN_JOB_TYPES, type PsqlAdminJobType } from '@queues/psql/types'

// GET /api/v1/psql/partitions - Get partition status
app.route('/api/v1/psql/partitions').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessPsqlAdmin, 'GET:/api/v1/psql/partitions')

  const status = await getPartitionStatus()
  ctx.json(status)
})

// GET /api/v1/psql/migrations - Get migration status
app.route('/api/v1/psql/migrations').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessPsqlAdmin, 'GET:/api/v1/psql/migrations')

  const status = await getMigrationStatus()
  ctx.json(status)
})

// POST /api/v1/psql/jobs - Dispatch a psql job
app.route('/api/v1/psql/jobs').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessPsqlAdmin, 'POST:/api/v1/psql/jobs')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const type = body.type as string
  ctx.assert(
    PSQL_ADMIN_JOB_TYPES.includes(type as PsqlAdminJobType),
    400,
    `Invalid job type. Must be one of: ${PSQL_ADMIN_JOB_TYPES.join(', ')}`,
  )

  switch (type) {
    case 'runMigrations':
      enqueueRunMigrations()
      break
    case 'runViews':
      enqueueRunViews()
      break
    case 'runConfigDriven':
      enqueueRunConfigDriven()
      break
    case 'createPartitions':
      enqueueCreatePartitions()
      break
    case 'cleanupPartitions':
      enqueueCleanupPartitions()
      break
  }

  ctx.json({ success: true })
})
