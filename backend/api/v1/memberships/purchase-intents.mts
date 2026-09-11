import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  createMembershipPurchaseIntent,
  getMembershipManagementDestination,
  MembershipPurchaseIneligibleError,
  type MembershipPurchaseProvider,
} from '@services/memberships'
import { assertNotSuspended } from '@services/users'
import { apiResponse } from '../../response-contract.mts'
import { parseJsonBody, requireAuth } from '../../response-helpers.mts'

const PROVIDERS = new Set<MembershipPurchaseProvider>([
  'stripe',
  'apple_app_store',
  'google_play',
  'microsoft_store',
])

type MembershipPurchaseIntentRequestBody = {
  provider: MembershipPurchaseProvider
  product_id: string
  idempotency_key: string
}

app.route('/api/v1/membership-purchase-intents').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/membership-purchase-intents')
  assertNotSuspended(currentUser)
  const body = await parseJsonBody<MembershipPurchaseIntentRequestBody>(ctx)
  ctx.assert(
    typeof body.provider === 'string' && PROVIDERS.has(body.provider),
    422,
    'Invalid provider',
  )
  ctx.assert(
    typeof body.product_id === 'string' && isUUID(body.product_id),
    422,
    'Invalid product_id',
  )
  ctx.assert(
    typeof body.idempotency_key === 'string' && isUUID(body.idempotency_key),
    422,
    'Invalid idempotency_key',
  )
  let intent: Awaited<ReturnType<typeof createMembershipPurchaseIntent>>
  try {
    intent = await createMembershipPurchaseIntent({
      userId: currentUser.id,
      ...(currentUser.email_address ? { email: currentUser.email_address } : {}),
      provider: body.provider,
      productId: body.product_id,
      idempotencyKey: body.idempotency_key,
    })
  } catch (error) {
    if (!(error instanceof MembershipPurchaseIneligibleError)) throw error
    ctx.setStatus(409)
    ctx.json(
      apiResponse('POST:/api/v1/membership-purchase-intents#conflict', {
        error: error.message,
        code: error.code,
        eligible_at: error.eligibleAt,
        management:
          error.provider === null
            ? null
            : {
                provider: error.provider,
                destination: getMembershipManagementDestination(error.provider),
              },
      }),
    )
    return
  }
  ctx.setStatus(intent.replayed ? 200 : 201)
  ctx.json({ purchase_intent: intent })
})
