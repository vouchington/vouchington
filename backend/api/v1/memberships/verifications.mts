import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createMembershipVerification,
  getMembershipVerification,
  type MembershipPurchaseProvider,
} from '@services/memberships'
import { assertNotSuspended } from '@services/users'
import {
  parseJsonBody,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'

type MembershipVerificationProvider = Exclude<MembershipPurchaseProvider, 'stripe'>

type MembershipVerificationRequestBody = {
  provider: MembershipVerificationProvider
  purchase_intent_id?: ApiUuidContract
  idempotency_key: ApiUuidContract
  /** Provider-specific receipt evidence, validated by the provider verifier. */
  evidence: unknown
}

app.route('/api/v1/membership-verifications').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/membership-verifications')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<MembershipVerificationRequestBody>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/membership-verifications', { body })
  ctx.assert(body.evidence !== undefined && body.evidence !== null, 422, 'Missing evidence')
  const verification = await createMembershipVerification({
    userId: currentUser.id,
    provider: body.provider,
    purchaseIntentId: body.purchase_intent_id ?? null,
    idempotencyKey: body.idempotency_key,
    evidence: body.evidence,
  })
  ctx.setStatus(verification.replayed ? 200 : 202)
  const { replayed: _, ...response } = verification
  ctx.json({ verification: response })
})

app.route('/api/v1/membership-verifications/:verificationId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/membership-verifications/:verificationId')
  const verificationId = validateUUIDParam(ctx, 'verificationId')
  validateRequestContract(ctx, 'GET:/api/v1/membership-verifications/:verificationId', {
    path: ctx.params,
  })
  ctx.json({ verification: await getMembershipVerification(currentUser.id, verificationId) })
})
