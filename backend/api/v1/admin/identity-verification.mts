import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { grantIdentityVerificationAttempt } from '@services/identity-verification'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { apiRequest } from '../../response-contract.mts'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'

// POST /api/v1/admin/users/:userId/identity-verification-attempts — grant one support retry.
app
  .route('/api/v1/admin/users/:userId/identity-verification-attempts')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      isAdminUser,
      'POST:/api/v1/admin/users/:userId/identity-verification-attempts',
    )
    assertNotSuspended(currentUser)
    const userId = validateUUIDParam(ctx, 'userId')
    const rawBody = await ctx.request.json('10kb')
    ctx.assert(
      rawBody !== null && typeof rawBody === 'object' && !Array.isArray(rawBody),
      400,
      'Request body must be an object',
    )
    const note = (rawBody as Record<string, unknown>).note
    ctx.assert(typeof note === 'string' && note.trim().length > 0, 422, 'note is required')
    ctx.assert(note.trim().length <= 2_000, 422, 'note must be 2,000 characters or less')

    const body = apiRequest('POST:/api/v1/admin/users/:userId/identity-verification-attempts', {
      note: note.trim(),
    })
    await grantIdentityVerificationAttempt(userId, currentUser.id, body.note)
    ctx.setStatus(201)
    ctx.json({ granted: true })
  })
