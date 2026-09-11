import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getUserPrivateByAnyCached } from '@services/entity-fetch'
import type { PrivateUser } from '@services/users/types'
import type { PublicVerifiedNameDisplay } from '@voucha/types/entities/user'
import {
  startIdentityVerification,
  updateDisplayPreferences,
} from '@services/identity-verification'
import {
  createIdentityCheckoutSession,
  retrieveIdentityVerificationSessionUrl,
} from '../../stripe-helpers.mts'

const VALID_NAME_DISPLAYS = ['hidden', 'first_name', 'first_name_last_initial', 'full_name']

function buildIdentityVerificationResponse(user: PrivateUser) {
  return {
    verification_status: user.verification_status ?? 'unverified',
    verification_provider: user.verification_provider ?? null,
    verification_completed_at: user.verification_completed_at ?? null,
    verified_badge_visible: user.verified_badge_visible ?? true,
    public_verified_name_display: user.public_verified_name_display ?? 'hidden',
  }
}

// GET /api/v1/my/identity-verification
app.route('/api/v1/my/identity-verification').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/identity-verification')

  const user = await getUserPrivateByAnyCached(currentUser.id)
  ctx.assert(user, 404, 'User not found')

  ctx.json(buildIdentityVerificationResponse(user))
})

// POST /api/v1/my/identity-verification/checkout-sessions
app.route('/api/v1/my/identity-verification/checkout-sessions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/my/identity-verification/checkout-sessions',
  )

  const baseUrl = process.env.PUBLIC_URL
  ctx.assert(baseUrl, 500, 'PUBLIC_URL environment variable is not configured')
  const successUrl = `${baseUrl}/my/identity-verification?status=success`
  const cancelUrl = `${baseUrl}/my/identity-verification?status=canceled`

  const { url } = await startIdentityVerification(
    currentUser,
    { successUrl, cancelUrl },
    { createIdentityCheckoutSession },
  )

  ctx.json({ url })
})

// PATCH /api/v1/my/identity-verification/display-preferences
app.route('/api/v1/my/identity-verification/display-preferences').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PATCH:/api/v1/my/identity-verification/display-preferences',
  )

  const rawBody = await ctx.request.json('10kb')
  ctx.assert(
    rawBody !== null && typeof rawBody === 'object' && !Array.isArray(rawBody),
    400,
    'Request body must be a JSON object',
  )
  const body = rawBody as Record<string, unknown>

  const input: {
    verified_badge_visible?: boolean
    public_verified_name_display?: PublicVerifiedNameDisplay
  } = {}

  if ('verified_badge_visible' in body) {
    ctx.assert(
      typeof body.verified_badge_visible === 'boolean',
      400,
      'verified_badge_visible must be a boolean',
    )
    input.verified_badge_visible = body.verified_badge_visible as boolean
  }

  if ('public_verified_name_display' in body) {
    ctx.assert(
      typeof body.public_verified_name_display === 'string' &&
        VALID_NAME_DISPLAYS.includes(body.public_verified_name_display),
      422,
      `public_verified_name_display must be one of: ${VALID_NAME_DISPLAYS.join(', ')}`,
    )
    input.public_verified_name_display =
      body.public_verified_name_display as PublicVerifiedNameDisplay
  }

  const before = await getUserPrivateByAnyCached(currentUser.id)
  ctx.assert(before, 404, 'User not found')
  ctx.assert(before.verification_status === 'verified', 422, 'User is not identity verified')

  await updateDisplayPreferences(currentUser.id, input)

  const updated = await getUserPrivateByAnyCached(currentUser.id)
  ctx.assert(updated, 404, 'User not found')

  ctx.json(buildIdentityVerificationResponse(updated))
})

// GET /api/v1/my/identity-verification/session-url
app.route('/api/v1/my/identity-verification/session-url').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/identity-verification/session-url')

  const user = await getUserPrivateByAnyCached(currentUser.id)
  ctx.assert(user, 404, 'User not found')
  ctx.assert(
    user.verification_status === 'identity_pending',
    409,
    'Verification session URL is only available while identity verification is in progress.',
  )

  const sessionId = user.pending_verification_session_id
  ctx.assert(sessionId, 404, 'No pending verification session')

  const url = await retrieveIdentityVerificationSessionUrl(sessionId)
  ctx.assert(url, 404, 'Verification session URL unavailable')

  ctx.json({ url })
})
