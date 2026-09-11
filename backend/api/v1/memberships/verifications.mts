import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  createMembershipVerification,
  getMembershipVerification,
  type MembershipPurchaseProvider,
} from '@services/memberships'
import { assertNotSuspended } from '@services/users'
import { parseJsonBody, requireAuth, validateUUIDParam } from '../../response-helpers.mts'

type MembershipVerificationProvider = Exclude<MembershipPurchaseProvider, 'stripe'>

const VERIFICATION_PROVIDERS = new Set<MembershipVerificationProvider>([
  'apple_app_store',
  'google_play',
  'microsoft_store',
])

type MembershipVerificationRequestBody = {
  provider: MembershipVerificationProvider
  purchase_intent_id?: string
  idempotency_key: string
  evidence: unknown
}

app.route('/api/v1/membership-verifications').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/membership-verifications')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<MembershipVerificationRequestBody>(ctx)
  ctx.assert(
    typeof body.provider === 'string' && VERIFICATION_PROVIDERS.has(body.provider),
    422,
    'Invalid provider',
  )
  ctx.assert(
    body.purchase_intent_id === undefined ||
      (typeof body.purchase_intent_id === 'string' && isUUID(body.purchase_intent_id)),
    422,
    'Invalid purchase_intent_id',
  )
  ctx.assert(
    typeof body.idempotency_key === 'string' && isUUID(body.idempotency_key),
    422,
    'Invalid idempotency_key',
  )
  ctx.assert(body.evidence !== undefined && body.evidence !== null, 422, 'Missing evidence')
  const verification = await createMembershipVerification({
    userId: currentUser.id,
    provider: body.provider,
    purchaseIntentId: typeof body.purchase_intent_id === 'string' ? body.purchase_intent_id : null,
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
  ctx.json({ verification: await getMembershipVerification(currentUser.id, verificationId) })
})
