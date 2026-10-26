import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  getHostnameBlockCleanupOperation,
  toHostnameBlockOperationResult,
} from '@services/hostname-blocking'
import { isAdminUser } from '@services/users'
import { apiResponse } from '@vouchington/utils/api-response-contract'
import app from '../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

// GET /api/v1/hostname-block-operations/:operationId - Admin: read cleanup progress
app.route('/api/v1/hostname-block-operations/:operationId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'GET:/api/v1/hostname-block-operations/:operationId',
  )
  ctx.assert(isUUID(ctx.params.operationId!), 422, 'Invalid operation ID')
  validateRequestContract(ctx, 'GET:/api/v1/hostname-block-operations/:operationId', {
    path: ctx.params,
  })

  const operation = await getHostnameBlockCleanupOperation(ctx.params.operationId!)
  ctx.assert(operation, 404, 'Hostname block operation not found')
  ctx.json(
    apiResponse(
      'GET:/api/v1/hostname-block-operations/:operationId',
      toHostnameBlockOperationResult(operation!),
    ),
  )
})
