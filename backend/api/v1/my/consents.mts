import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { grantConsent } from '@services/user-consents/create'
import { getActiveConsents } from '@services/user-consents/get'
import { revokeConsent } from '@services/user-consents/revoke'
import type { ConsentType } from '@services/user-consents/types'
import {
  requireAuth,
  requireAuthForSuspendedException,
  validateRequestContract,
} from '../../response-helpers.mts'

type GrantConsentRequest = { consent_type: ConsentType; version: string }

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

  const body = (await ctx.request.json('10kb')) as GrantConsentRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/consents', { body })
  const version = body.version.trim()
  ctx.assert(version.length > 0, 400, 'version is required')
  ctx.assert(version.length <= 50, 422, 'version must be 50 characters or fewer')

  const consent = await grantConsent(currentUser.id, body.consent_type, version)

  ctx.setStatus(201)
  ctx.json({ consent })
})

// DELETE /api/v1/my/consents/:type
app.route('/api/v1/my/consents/:type').delete(async (ctx: Context) => {
  const currentUser = await requireAuthForSuspendedException(
    ctx,
    'DELETE:/api/v1/my/consents/:type',
  )
  validateRequestContract(ctx, 'DELETE:/api/v1/my/consents/:type', { path: ctx.params })

  // The path schema is a plain string, so the consent-type enum is checked here.
  const consentType = ctx.params.type
  ctx.assert(isConsentType(consentType), 400, 'Invalid consent type')

  await revokeConsent(currentUser.id, consentType)

  ctx.setStatus(204)
})
