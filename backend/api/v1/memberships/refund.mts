import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuth } from '../../response-helpers.mts'
import { apiHeaders, apiRequest, apiResponse } from '../../response-contract.mts'
import { currentUserCanRefundMembership } from '@services/memberships/authorization'
import { startAdministratorRefundReconciliation } from '@services/memberships'
import { enqueueDispatchMembershipRefundReconciliationBestEffort } from '@queues/memberships/enqueues'
import type { MembershipRefundReason } from '@services/memberships/types'
import { isUUID } from '@modules/utils'
import { isMoney, type Money } from '@ts-shared/money'
import { listSubscriptionInvoicesOperation } from '@modules/stripe/operations'

const VALID_REASONS = new Set<string>(['goodwill', 'requested', 'dispute', 'other'])

type MembershipRefundRequestBody = {
  user_id: string
  charge_id?: string | null
  payment_intent_id?: string | null
  invoice_id: string
  reason: MembershipRefundReason
  cancel?: boolean
  amount?: Money
  note?: string | null
  idempotency_key: string
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
    ctx.throw(403, 'Admin or customer support access required')
  }

  const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)

  ctx.assert(typeof rawBody.user_id === 'string' && rawBody.user_id, 400, 'Missing user_id')
  ctx.assert(
    rawBody.charge_id === undefined ||
      rawBody.charge_id === null ||
      typeof rawBody.charge_id === 'string',
    400,
    'Invalid charge_id',
  )
  ctx.assert(
    rawBody.payment_intent_id === undefined ||
      rawBody.payment_intent_id === null ||
      typeof rawBody.payment_intent_id === 'string',
    400,
    'Invalid payment_intent_id',
  )
  ctx.assert(
    (typeof rawBody.charge_id === 'string' && rawBody.charge_id) ||
      (typeof rawBody.payment_intent_id === 'string' && rawBody.payment_intent_id),
    400,
    'Must provide charge_id or payment_intent_id',
  )
  ctx.assert(
    typeof rawBody.invoice_id === 'string' && rawBody.invoice_id,
    400,
    'Missing invoice_id',
  )
  ctx.assert(
    typeof rawBody.reason === 'string' && VALID_REASONS.has(rawBody.reason),
    400,
    'Invalid reason',
  )
  ctx.assert(
    rawBody.cancel === undefined || typeof rawBody.cancel === 'boolean',
    400,
    'Invalid cancel',
  )
  ctx.assert(
    typeof rawBody.idempotency_key === 'string' && isUUID(rawBody.idempotency_key),
    400,
    'Invalid idempotency_key',
  )

  if (rawBody.amount !== undefined) {
    ctx.assert(isMoney(rawBody.amount) && rawBody.amount.amount > 0, 400, 'Invalid amount')
  }

  if (rawBody.note != null) {
    ctx.assert(typeof rawBody.note === 'string', 400, 'note must be a string')
    ctx.assert(rawBody.note.trim().length > 0, 400, 'note must not be blank')
    ctx.assert(rawBody.note.trim().length <= 1000, 400, 'note must be 1000 characters or fewer')
  }

  const wireRequestBody: MembershipRefundRequestBody = {
    user_id: rawBody.user_id,
    ...(rawBody.charge_id !== undefined && {
      charge_id: rawBody.charge_id as string | null,
    }),
    ...(rawBody.payment_intent_id !== undefined && {
      payment_intent_id: rawBody.payment_intent_id as string | null,
    }),
    invoice_id: rawBody.invoice_id,
    reason: rawBody.reason as MembershipRefundReason,
    ...(rawBody.cancel !== undefined && { cancel: rawBody.cancel }),
    ...(rawBody.amount !== undefined && { amount: rawBody.amount as Money }),
    ...(rawBody.note !== undefined && {
      note: rawBody.note === null ? null : (rawBody.note as string).trim(),
    }),
    idempotency_key: rawBody.idempotency_key,
  }
  const body = apiRequest('POST:/api/v1/memberships/refunds', wireRequestBody)

  const reconciliation = await startAdministratorRefundReconciliation(
    currentUser.id,
    {
      targetUserId: body.user_id,
      chargeId: body.charge_id ?? null,
      paymentIntentId: body.payment_intent_id ?? null,
      invoiceId: body.invoice_id,
      reason: body.reason as MembershipRefundReason,
      cancel: body.cancel ?? false,
      amount: body.amount,
      note: body.note ?? null,
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
  enqueueDispatchMembershipRefundReconciliationBestEffort()
  ctx.setStatus(202)
  ctx.set('Retry-After', '300')
  ctx.json(
    apiResponse('POST:/api/v1/memberships/refunds#reconciling', {
      outcome: 'reconciling' as const,
      retry_after_seconds: 300,
    }),
  )
})
