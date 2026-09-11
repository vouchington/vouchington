import app from '../../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth } from '../../../response-helpers.mts'
import { isUUID } from '@modules/utils'
import {
  getImportBatch,
  getImportRowsByBatchId,
  getImportBatchProgress,
  currentUserCanViewImportBatch,
} from '@services/admin-imports'

/**
 * GET /api/v1/imports/:batchId — Get status and progress of an import batch.
 * Streams batch metadata, rows, and progress summary.
 */
app.route('/api/v1/imports/:batchId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/imports/:batchId')

  const batchId = ctx.params.batchId!
  ctx.assert(isUUID(batchId), 400, 'Invalid batch ID')

  const batch = await getImportBatch(batchId)
  ctx.assert(batch, 404, 'Import batch not found')
  ctx.assert(currentUserCanViewImportBatch(currentUser, batch), 404, 'Import batch not found')

  ctx.setType('json')
  await ctx.pipeline(
    streamJsonObject({
      batch,
      rows: getImportRowsByBatchId(batchId),
      progress: getImportBatchProgress(batchId),
    }),
  )
})
