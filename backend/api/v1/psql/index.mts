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
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
} from '../../response-helpers.mts'
import { parseClassifierPartitionRange } from '@data-stores/psql/migration-runner/classifier-partition-range'
import type { ClassifierPartitionRange, PsqlAdminJobType } from '@queues/psql/types'

type PsqlJobRequest = { type: PsqlAdminJobType; classifierRange?: ClassifierPartitionRange }

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

  const body = (await parseJsonBody(ctx, '1mb')) as PsqlJobRequest
  validateRequestContract(ctx, 'POST:/api/v1/psql/jobs', { body })
  const { type, classifierRange } = body
  if (classifierRange) {
    if (type !== 'createPartitions' && type !== 'cleanupPartitions') {
      ctx.throw(422, 'Classifier partition ranges require a partition action')
    }
    try {
      parseClassifierPartitionRange(classifierRange)
    } catch {
      ctx.throw(422, 'Invalid classifier partition range')
    }
  }

  switch (type) {
    case 'runMigrations':
      await enqueueRunMigrations()
      break
    case 'runViews':
      await enqueueRunViews()
      break
    case 'runConfigDriven':
      await enqueueRunConfigDriven()
      break
    case 'createPartitions':
      await enqueueCreatePartitions(classifierRange)
      break
    case 'cleanupPartitions':
      await enqueueCleanupPartitions(classifierRange)
      break
  }

  ctx.json({ success: true })
})
