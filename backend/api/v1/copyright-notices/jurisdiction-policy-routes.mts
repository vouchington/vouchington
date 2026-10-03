import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanApproveCopyrightJurisdictionPolicy,
  recordCopyrightJurisdictionPolicyApproval,
  withdrawCopyrightJurisdictionPolicyApproval,
} from '@services/copyright-notices'
import { assertTerritorialJurisdiction } from '@services/copyright-notices/territorial-fields'
import { parsePolicyVersion } from '@services/copyright-notices/territorial-http-input'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type { CopyrightJurisdictionPolicyRequest } from './territorial-request-types.mts'

// Both handlers keep their admission order (authentication and administrator role, rate limit,
// suspension, content type, field-named parsers, path id) and add the generated contract
// immediately before the first service call.
app.route('/api/v1/copyright-jurisdiction-policies').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightJurisdictionPolicy,
    'POST:/api/v1/copyright-jurisdiction-policies',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightJurisdictionPolicyRequest>(ctx)
  const jurisdiction = assertTerritorialJurisdiction(body.jurisdiction)
  const policyVersion = parsePolicyVersion(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-jurisdiction-policies', { body })
  const approval = await recordCopyrightJurisdictionPolicyApproval(currentUser, {
    jurisdiction,
    policyVersion,
  })
  ctx.setStatus(201)
  ctx.json({ copyright_jurisdiction_policy: approval })
})

app.route('/api/v1/copyright-jurisdiction-policies/:id/withdrawals').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightJurisdictionPolicy,
    'POST:/api/v1/copyright-jurisdiction-policies/:id/withdrawals',
  )
  assertNotSuspended(currentUser)
  const approvalId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-jurisdiction-policies/:id/withdrawals', {
    path: ctx.params,
  })
  const withdrawal = await withdrawCopyrightJurisdictionPolicyApproval(currentUser, approvalId)
  ctx.setStatus(201)
  ctx.json({ copyright_jurisdiction_policy_withdrawal: withdrawal })
})
