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
  getOptionalProtocolAuthAndRateLimit,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiHeaders, apiNoRequestBody, apiResponse } from '../../response-contract.mts'
import type {
  CopyrightGuestCapabilityIssueRequest,
  CopyrightGuestFilingRequest,
  CopyrightGuestInformationRequest,
} from './guest-capability-request-types.mts'
import { enqueueCopyrightSubmissionGuidanceBestEffort } from './submission-guidance-enqueue.mts'

const guestFilingKinds: readonly CopyrightGuestFilingRequest['kind'][] = [
  'supplement',
  'withdrawal',
  'court_or_ccb_hold',
]

function isGuestFilingKind(value: unknown): value is CopyrightGuestFilingRequest['kind'] {
  return guestFilingKinds.some(kind => kind === value)
}

function futureInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) || parsed <= new Date() ? null : parsed
}

// Every handler keeps its admission order (content type, authentication and role, rate limit,
// suspension, field-named parsers) and adds the generated contract immediately before the first
// service call.
app.route('/api/v1/copyright-notices/:id/guest-capabilities').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-notices/:id/guest-capabilities',
  )
  assertNotSuspended(currentUser)
  const body = (await ctx.request.json('1mb')) as CopyrightGuestCapabilityIssueRequest
  const expiresAt = futureInstant(body.expires_at)
  if (!expiresAt) ctx.throw(422, 'expires_at must be a future instant')
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-notices/:id/guest-capabilities', {
    path: ctx.params,
    body,
  })
  const capability = await issueCopyrightGuestCapability({ currentUser, noticeId, expiresAt })
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
    const noticeId = validateUUIDParam(ctx, 'id')
    const capabilityId = validateUUIDParam(ctx, 'capabilityId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
      { path: ctx.params },
    )
    const revokedAt = new Date()
    await revokeCopyrightGuestCapability({ currentUser, noticeId, capabilityId, revokedAt })
    ctx.json(
      apiResponse(
        'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
        {
          copyright_guest_capability: { id: capabilityId, revoked_at: revokedAt.toISOString() },
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
    const body = (await ctx.request.json('1mb')) as CopyrightGuestInformationRequest
    if (!boundedString(body.statement, 50_000)) ctx.throw(422, 'statement is required')
    const noticeId = validateUUIDParam(ctx, 'id')
    const capabilityId = validateUUIDParam(ctx, 'capabilityId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
      { path: ctx.params, body },
    )
    const correspondence = await requestCopyrightGuestInformation({
      currentUser,
      noticeId,
      capabilityId,
      statement: body.statement,
    })
    ctx.setStatus(201)
    ctx.json(
      apiResponse(
        'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
        { copyright_correspondence: { id: correspondence.id } },
      ),
    )
  })

// The guest presents a case capability in the `Copyright-Guest-Capability` header. The header is
// checked locally (`403`) and is never passed to the contract validator, logged, or echoed, so a
// schema diagnostic cannot disclose it.
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
  await getOptionalProtocolAuthAndRateLimit(ctx, 'POST:/api/v1/copyright-notices/:id/guest-filings')
  const body = (await ctx.request.json('1mb')) as CopyrightGuestFilingRequest
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-notices.guest-filing' })
  if (!isGuestFilingKind(body.kind)) ctx.throw(422, 'kind is not a guest filing')
  if (!boundedString(body.statement, 50_000)) ctx.throw(422, 'statement is required')
  const token = ctx.req.headers['copyright-guest-capability']
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) {
    ctx.throw(403, 'Copyright guest capability is required')
  }
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-notices/:id/guest-filings', {
    path: ctx.params,
    body,
  })
  const filing = await appendCopyrightGuestFiling({
    noticeId,
    token,
    now: new Date(),
    kind: body.kind,
    statement: body.statement,
  })
  if (filing.kind === 'court_or_ccb_hold')
    await enqueueCopyrightSubmissionGuidanceBestEffort(filing.id)
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
