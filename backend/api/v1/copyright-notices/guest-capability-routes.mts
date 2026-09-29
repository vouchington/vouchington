import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  appendCopyrightGuestFiling,
  currentUserCanReviewCopyrightNotices,
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
} from '@services/copyright-notices'
import { boundedString } from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import {
  getOptionalAuthAndRateLimit,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiHeaders, apiNoRequestBody, apiRequest, apiResponse } from '../../response-contract.mts'

const guestFilingKinds = ['supplement', 'withdrawal', 'court_or_ccb_hold'] as const
type GuestFilingKind = (typeof guestFilingKinds)[number]

function isGuestFilingKind(value: unknown): value is GuestFilingKind {
  return guestFilingKinds.some(kind => kind === value)
}

function futureInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) || parsed <= new Date() ? null : parsed
}

app.route('/api/v1/copyright-notices/:id/guest-capabilities').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-notices/:id/guest-capabilities',
  )
  assertNotSuspended(currentUser)
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  const expiresAt = futureInstant(body.expires_at)
  if (!expiresAt) ctx.throw(422, 'expires_at must be a future instant')
  apiRequest('POST:/api/v1/copyright-notices/:id/guest-capabilities', {
    expires_at: expiresAt.toISOString(),
  })
  const capability = await issueCopyrightGuestCapability({
    noticeId: validateUUIDParam(ctx, 'id'),
    expiresAt,
  })
  ctx.setStatus(201)
  ctx.json(
    apiResponse('POST:/api/v1/copyright-notices/:id/guest-capabilities', {
      copyright_guest_capability: {
        id: capability.id,
        expires_at: expiresAt.toISOString(),
        token: capability.token,
      },
    }),
  )
})

app
  .route('/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    apiNoRequestBody(
      'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
    )
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
    )
    assertNotSuspended(currentUser)
    const revokedAt = new Date()
    await revokeCopyrightGuestCapability({
      noticeId: validateUUIDParam(ctx, 'id'),
      capabilityId: validateUUIDParam(ctx, 'capabilityId'),
      revokedAt,
    })
    ctx.json(
      apiResponse(
        'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
        {
          copyright_guest_capability: {
            id: validateUUIDParam(ctx, 'capabilityId'),
            revoked_at: revokedAt.toISOString(),
          },
        },
      ),
    )
  })

app
  .route('/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests')
  .post(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
    )
    assertNotSuspended(currentUser)
    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    if (!boundedString(body.statement, 50_000)) ctx.throw(422, 'statement is required')
    const statement = body.statement
    apiRequest(
      'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
      { statement },
    )
    const correspondence = await requestCopyrightGuestInformation({
      currentUser,
      noticeId: validateUUIDParam(ctx, 'id'),
      capabilityId: validateUUIDParam(ctx, 'capabilityId'),
      statement,
    })
    ctx.setStatus(201)
    ctx.json(
      apiResponse(
        'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
        { copyright_correspondence: { id: correspondence.id } },
      ),
    )
  })

app.route('/api/v1/copyright-notices/:id/guest-filings').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  apiHeaders('POST:/api/v1/copyright-notices/:id/guest-filings', {
    request: {
      'Copyright-Guest-Capability': {
        description: 'Raw case capability token. Mail and other-case tokens are not accepted.',
        required: true,
        type: 'string',
      },
    },
  })
  await getOptionalAuthAndRateLimit(ctx, 'POST:/api/v1/copyright-notices/:id/guest-filings')
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.guest-filing' })
  if (!isGuestFilingKind(body.kind)) ctx.throw(422, 'kind is not a guest filing')
  if (!boundedString(body.statement, 50_000)) ctx.throw(422, 'statement is required')
  const kind = body.kind
  const statement = body.statement
  const token = ctx.req.headers['copyright-guest-capability']
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) {
    ctx.throw(403, 'Copyright guest capability is required')
  }
  apiRequest('POST:/api/v1/copyright-notices/:id/guest-filings', {
    kind,
    statement,
    cf_turnstile_response:
      typeof body.cf_turnstile_response === 'string' ? body.cf_turnstile_response : null,
  })
  const filing = await appendCopyrightGuestFiling({
    noticeId: validateUUIDParam(ctx, 'id'),
    token,
    now: new Date(),
    kind,
    statement,
  })
  ctx.setStatus(201)
  ctx.json(
    apiResponse('POST:/api/v1/copyright-notices/:id/guest-filings', {
      copyright_submission: {
        id: filing.id,
        kind: filing.kind,
        received_at: filing.received_at.toISOString(),
      },
    }),
  )
})
