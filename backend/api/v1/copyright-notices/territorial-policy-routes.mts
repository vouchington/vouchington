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
  validateUUIDParam,
} from '../../response-helpers.mts'

app.route('/api/v1/copyright-territorial-policies').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightTerritorialPolicy,
    'POST:/api/v1/copyright-territorial-policies',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const approval = await recordCopyrightTerritorialPolicyApproval(currentUser, {
    jurisdiction: assertTerritorialJurisdiction(body.jurisdiction),
    policyVersion: parsePolicyVersion(body),
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
  const withdrawal = await withdrawCopyrightTerritorialPolicyApproval(
    currentUser,
    validateUUIDParam(ctx, 'id'),
  )
  ctx.setStatus(201)
  ctx.json({ copyright_territorial_policy_withdrawal: withdrawal })
})
