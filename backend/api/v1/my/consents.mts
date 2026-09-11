import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { grantConsent } from '@services/user-consents/create'
import { getActiveConsents } from '@services/user-consents/get'
import { revokeConsent } from '@services/user-consents/revoke'
import type { ConsentType } from '@services/user-consents/types'
import { requireAuth } from '../../response-helpers.mts'

const VALID_CONSENT_TYPES: ConsentType[] = [
  'privacy_policy',
  'terms_of_service',
  'cookie_analytics',
]

function isConsentType(value: unknown): value is ConsentType {
  return typeof value === 'string' && (VALID_CONSENT_TYPES as string[]).includes(value)
}

// GET /api/v1/my/consents
app.route('/api/v1/my/consents').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/consents')

  const consents = await getActiveConsents(currentUser.id)
  ctx.json({ results: consents })
})

// POST /api/v1/my/consents
app.route('/api/v1/my/consents').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/consents')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(isConsentType(body.consent_type), 400, 'consent_type is required and must be valid')
  ctx.assert(
    typeof body.version === 'string' && body.version.trim().length > 0,
    400,
    'version is required',
  )

  ctx.assert(
    (body.version as string).trim().length <= 50,
    422,
    'version must be 50 characters or fewer',
  )

  const consent = await grantConsent(
    currentUser.id,
    body.consent_type,
    (body.version as string).trim(),
  )

  ctx.setStatus(201)
  ctx.json({ consent })
})

// DELETE /api/v1/my/consents/:type
app.route('/api/v1/my/consents/:type').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/consents/:type')

  const consentType = ctx.params.type
  ctx.assert(isConsentType(consentType), 400, 'Invalid consent type')

  await revokeConsent(currentUser.id, consentType)

  ctx.setStatus(204)
})
