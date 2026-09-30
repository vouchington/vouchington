import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiHeaders, apiResponse } from '../../response-contract.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { currentUserCanRefundMembership } from '@services/memberships/authorization'
import { startAdministratorRefundReconciliation } from '@services/memberships'
import { enqueueDispatchMembershipRefundReconciliationBestEffort } from '@queues/memberships/enqueues'
import type { MembershipRefundReason } from '@services/memberships/types'
import type { Money } from '@ts-shared/money'
import { listSubscriptionInvoicesOperation } from '@modules/stripe/operations'

type MembershipRefundRequestBody = {
  user_id: ApiUuidContract
  charge_id?: string | null
  payment_intent_id?: string | null
  invoice_id: string
  reason: MembershipRefundReason
  cancel?: boolean
  amount?: Money
  note?: string | null
  idempotency_key: ApiUuidContract
}

app.route('/api/v1/memberships/refunds').post(async (ctx: Context) => {
  apiHeaders('POST:/api/v1/memberships/refunds', {
    responses: {
      202: {
        description: 'Refund reconciliation continues asynchronously.',
        headers: {
          'Retry-After': {
            description: 'Seconds before replaying the same idempotent refund request.',
            required: true,
            type: 'integer',
          },
        },
      },
    },
  })
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/memberships/refunds')

  if (!currentUserCanRefundMembership(currentUser)) {
    ctx.throw(403, 'Administrator access required')
  }

  const body = await parseJsonBody<MembershipRefundRequestBody>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/memberships/refunds', { body })

  ctx.assert(
    body.charge_id || body.payment_intent_id,
    400,
    'Must provide charge_id or payment_intent_id',
  )
  if (body.amount !== undefined) ctx.assert(body.amount.amount > 0, 400, 'Invalid amount')
  const note = body.note?.trim() ?? null
  if (body.note != null) {
    ctx.assert(note!.length > 0, 400, 'note must not be blank')
    ctx.assert(note!.length <= 1000, 400, 'note must be 1000 characters or fewer')
  }

  const reconciliation = await startAdministratorRefundReconciliation(
    currentUser.id,
    {
      targetUserId: body.user_id,
      chargeId: body.charge_id ?? null,
      paymentIntentId: body.payment_intent_id ?? null,
      invoiceId: body.invoice_id,
      reason: body.reason,
      cancel: body.cancel ?? false,
      amount: body.amount,
      note,
      idempotencyToken: body.idempotency_key,
    },
    {
      listSubscriptionInvoices: listSubscriptionInvoicesOperation,
    },
  )
  if (reconciliation.result.outcome === 'completed') {
    ctx.setStatus(201)
    ctx.json(
      apiResponse('POST:/api/v1/memberships/refunds#completed', {
        outcome: 'completed' as const,
        refund: { id: reconciliation.result.refundId },
        cancellation_status: reconciliation.result.cancellationStatus,
      }),
    )
    return
  }
  void enqueueDispatchMembershipRefundReconciliationBestEffort()
  ctx.setStatus(202)
  ctx.set('Retry-After', '300')
  ctx.json(
    apiResponse('POST:/api/v1/memberships/refunds#reconciling', {
      outcome: 'reconciling' as const,
      retry_after_seconds: 300,
    }),
  )
})
