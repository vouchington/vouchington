import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createMembershipPurchaseIntent,
  getMembershipManagementDestination,
  MembershipPurchaseIneligibleError,
  type MembershipPurchaseProvider,
} from '@services/memberships'
import { assertNotSuspended } from '@services/users'
import { apiResponse } from '../../response-contract.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'

type MembershipPurchaseIntentRequestBody = {
  provider: MembershipPurchaseProvider
  product_id: ApiUuidContract
  idempotency_key: ApiUuidContract
}

app.route('/api/v1/membership-purchase-intents').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/membership-purchase-intents')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<MembershipPurchaseIntentRequestBody>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/membership-purchase-intents', { body })
  let intent: Awaited<ReturnType<typeof createMembershipPurchaseIntent>>
  try {
    intent = await createMembershipPurchaseIntent({
      userId: currentUser.id,
      ...(currentUser.email_address ? { email: currentUser.email_address } : {}),
      provider: body.provider,
      productId: body.product_id,
      idempotencyKey: body.idempotency_key,
    })
  } catch (err) {
    if (!(err instanceof MembershipPurchaseIneligibleError)) throw err
    ctx.setStatus(409)
    ctx.json(
      apiResponse('POST:/api/v1/membership-purchase-intents#conflict', {
        error: err.message,
        code: err.code,
        eligible_at: err.eligibleAt,
        management:
          err.provider === null
            ? null
            : {
                provider: err.provider,
                destination: getMembershipManagementDestination(err.provider),
              },
      }),
    )
    return
  }
  ctx.setStatus(intent.replayed ? 200 : 201)
  ctx.json({ purchase_intent: intent })
})
