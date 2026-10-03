import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  acknowledgeEuCopyrightNotice,
  assertCopyrightIntakeEnabled,
  receiveEuCopyrightNotice,
  recordEuCopyrightSupervisedComplaint,
  submitEuCopyrightRedress,
} from '@services/copyright-notices'
import {
  parseTerritorialNoticeBody,
  parseTerritorialText,
} from '@services/copyright-notices/territorial-http-input'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type {
  CopyrightTerritorialNoticeRequest,
  CopyrightTerritorialRedressRequest,
  CopyrightTerritorialSupervisedComplaintRequest,
} from './territorial-request-types.mts'

// Every handler keeps its admission order (kill switch, content type, authentication, suspension,
// CAPTCHA, Idempotency-Key, field-named parsers, path id) and adds the generated contract
// immediately before the first service call. The service still decides ownership, jurisdiction
// availability, and existence, so those rejections stay behind a malformed body, as a missing
// field already did. The staff routes live in `eu-copyright-staff-routes.mts`.
app.route('/api/v1/copyright-eu-notices').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  assertCopyrightIntakeEnabled()
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/copyright-eu-notices')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<CopyrightTerritorialNoticeRequest>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-eu-notices.create' })
  const idempotencyKey = requireIdempotencyKey(ctx)
  const notice = parseTerritorialNoticeBody(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-notices', { body })
  const receipt = await receiveEuCopyrightNotice(currentUser, idempotencyKey, notice)
  const acknowledgment = await acknowledgeEuCopyrightNotice(currentUser, receipt.notice_id)
  ctx.setStatus(receipt.is_duplicate ? 200 : 201)
  ctx.json({ copyright_eu_notice: receipt, acknowledgment })
})

app.route('/api/v1/copyright-eu-notices/:id/redress-requests').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/copyright-eu-notices/:id/redress-requests',
  )
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<CopyrightTerritorialRedressRequest>(ctx)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'copyright-eu-redress.create' })
  const noticeId = validateUUIDParam(ctx, 'id')
  const idempotencyKey = requireIdempotencyKey(ctx)
  const explanation = parseTerritorialText(body, 'explanation')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-notices/:id/redress-requests', {
    path: ctx.params,
    body,
  })
  const redress = await submitEuCopyrightRedress(currentUser, noticeId, idempotencyKey, explanation)
  ctx.setStatus(redress.is_duplicate ? 200 : 201)
  ctx.json({ copyright_eu_redress_request: redress })
})

app.route('/api/v1/copyright-eu-notices/:id/supervised-complaints').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/copyright-eu-notices/:id/supervised-complaints',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightTerritorialSupervisedComplaintRequest>(ctx)
  const noticeId = validateUUIDParam(ctx, 'id')
  const authorityReference = parseTerritorialText(body, 'authority_reference')
  const explanation = parseTerritorialText(body, 'explanation')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-eu-notices/:id/supervised-complaints', {
    path: ctx.params,
    body,
  })
  const complaint = await recordEuCopyrightSupervisedComplaint(currentUser, noticeId, {
    authorityReference,
    explanation,
  })
  ctx.setStatus(201)
  ctx.json({ copyright_eu_supervised_complaint: complaint })
})

function requireIdempotencyKey(ctx: Context): string {
  const value = ctx.req.headers['idempotency-key']
  ctx.assert(
    !Array.isArray(value) && typeof value === 'string' && isUUID(value),
    400,
    'Idempotency-Key must be a UUID',
  )
  return value
}
