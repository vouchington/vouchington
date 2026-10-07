import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  getUserPreservationHoldState,
  isAdminUser,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '@services/users'

// Typed as a string: the generated contract checks the carrier shape and unknown keys, while the
// blank and length checks in the service keep their 422 responses without echoing the reference.
type PlacePreservationHoldRequest = { reference: string }

// Administrator-only legal-process preservation hold (issue #1449). An open hold pauses final
// account purging; the reference is sensitive and is never logged or copied to the audit log.
app
  .route('/api/v1/users/:userId/preservation-hold')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'GET:/api/v1/users/:userId/preservation-hold',
    )
    const userId = validateUUIDParam(ctx, 'userId')
    validateRequestContract(ctx, 'GET:/api/v1/users/:userId/preservation-hold', {
      path: ctx.params,
    })

    const state = await getUserPreservationHoldState(currentUser, userId)
    ctx.json({ account_deleted_at: state.accountDeletedAt, holds: state.holds })
  })
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'PUT:/api/v1/users/:userId/preservation-hold',
    )
    const userId = validateUUIDParam(ctx, 'userId')
    const body = await parseJsonBody<PlacePreservationHoldRequest>(ctx, '4kb')
    validateRequestContract(ctx, 'PUT:/api/v1/users/:userId/preservation-hold', {
      body,
      path: ctx.params,
    })

    const { accountDeletedAt, ...hold } = await placeUserPreservationHold(
      currentUser,
      userId,
      body.reference,
    )
    ctx.json({ account_deleted_at: accountDeletedAt, hold })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'DELETE:/api/v1/users/:userId/preservation-hold',
    )
    const userId = validateUUIDParam(ctx, 'userId')
    validateRequestContract(ctx, 'DELETE:/api/v1/users/:userId/preservation-hold', {
      path: ctx.params,
    })

    ctx.json({ hold: await releaseUserPreservationHold(currentUser, userId) })
  })
