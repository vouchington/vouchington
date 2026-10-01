import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanApproveCopyrightTerritorialPolicy,
  recordCopyrightTerritorialPolicyApproval,
  withdrawCopyrightTerritorialPolicyApproval,
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
import type { CopyrightTerritorialPolicyRequest } from './territorial-request-types.mts'

// Both handlers keep their admission order (authentication and administrator role, rate limit,
// suspension, content type, field-named parsers, path id) and add the generated contract
// immediately before the first service call.
app.route('/api/v1/copyright-territorial-policies').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightTerritorialPolicy,
    'POST:/api/v1/copyright-territorial-policies',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightTerritorialPolicyRequest>(ctx)
  const jurisdiction = assertTerritorialJurisdiction(body.jurisdiction)
  const policyVersion = parsePolicyVersion(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-territorial-policies', { body })
  const approval = await recordCopyrightTerritorialPolicyApproval(currentUser, {
    jurisdiction,
    policyVersion,
  })
  ctx.setStatus(201)
  ctx.json({ copyright_territorial_policy: approval })
})

app.route('/api/v1/copyright-territorial-policies/:id/withdrawals').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightTerritorialPolicy,
    'POST:/api/v1/copyright-territorial-policies/:id/withdrawals',
  )
  assertNotSuspended(currentUser)
  const approvalId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-territorial-policies/:id/withdrawals', {
    path: ctx.params,
  })
  const withdrawal = await withdrawCopyrightTerritorialPolicyApproval(currentUser, approvalId)
  ctx.setStatus(201)
  ctx.json({ copyright_territorial_policy_withdrawal: withdrawal })
})
