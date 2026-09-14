import * as stripeRefunds from '@modules/stripe/refunds'
import { isCurrencyCode } from '@ts-shared/money'
import {
  enrichRefundReconciliationAttemptProviderRefund,
  getLatestRefundReconciliationAttempt,
  recordRefundReconciliationAttempt,
} from './ledger.mts'
import type { RefundReconciliationDispatch, RefundReconciliationLease } from './types.mts'
import { needsRefundMetadataDiscovery } from './context.mts'
import { discoverRefundByOperationMetadata } from './metadata-discovery.mts'
import { administratorRefundPolicy } from './administrator-policy.mts'
import { getClaimedRefundReconciliationLease } from './claimed-lease.mts'
import {
  callRefundProvider,
  RefundProviderOperationError,
  unwrapRefundProviderOperationError,
} from './provider-operations.mts'
import { handleRefundProviderOutcome } from './retry-policy.mts'

export type RefundReconciliationPolicy<Context> = {
  complete: (
    lease: RefundReconciliationLease,
    context: Context,
    refund: SucceededRefund,
  ) => Promise<'completed' | 'pending'>
  createLookup: (context: Context) => { chargeId?: string; paymentIntentId?: string }
  getContext: (operationId: string) => Promise<Context | null>
  knownProviderRefundId?: (context: Context) => string | null
  lookup: (context: Context) => { chargeId: string | null; paymentIntentId: string | null }
  providerIdempotencyKey: (
    lease: RefundReconciliationLease,
    priorTerminalRefund: { id: string } | null,
  ) => string
  providerFailuresAreDurable?: boolean
}

type SucceededRefund = {
  amount: number
  charge: string | { id: string } | null
  currency: string
  id: string
  payment_intent: string | { id: string } | null
}

export type RefundProviderOperations = {
  createRefund: typeof stripeRefunds.createStripeRefund
  getRefund: typeof stripeRefunds.getStripeRefund
  listRefundPage: typeof stripeRefunds.listStripeRefundsForPaymentPage
}

export async function reconcileMembershipRefundOperation(
  dispatch: RefundReconciliationDispatch,
  operations: RefundProviderOperations = {
    createRefund: stripeRefunds.createStripeRefund,
    getRefund: stripeRefunds.getStripeRefund,
    listRefundPage: stripeRefunds.listStripeRefundsForPaymentPage,
  },
): Promise<void> {
  const lease = await getClaimedRefundReconciliationLease(dispatch)
  if (!lease) return
  await reconcileLeasedRefundOperation(lease, administratorRefundPolicy, operations)
}

export async function reconcileLeasedRefundOperation<Context>(
  lease: RefundReconciliationLease,
  policy: RefundReconciliationPolicy<Context>,
  operations: RefundProviderOperations,
): Promise<void> {
  try {
    await reconcileLeasedRefundOperationProviderWork(lease, policy, operations)
  } catch (error) {
    if (!(error instanceof RefundProviderOperationError) || !policy.providerFailuresAreDurable)
      throw unwrapRefundProviderOperationError(error)
    await handleRefundProviderOutcome(policy, lease, error.message)
  }
}

async function reconcileLeasedRefundOperationProviderWork<Context>(
  lease: RefundReconciliationLease,
  policy: RefundReconciliationPolicy<Context>,
  operations: RefundProviderOperations,
): Promise<void> {
  const context = await policy.getContext(lease.id)
  if (!context) return
  let attempt = await getLatestRefundReconciliationAttempt(lease.id)
  if (!attempt && policy.knownProviderRefundId?.(context)) {
    attempt = await recordRefundReconciliationAttempt(
      lease,
      policy.providerIdempotencyKey(lease, null),
    )
    attempt = await enrichRefundReconciliationAttemptProviderRefund(
      attempt.id,
      policy.knownProviderRefundId(context)!,
    )
  }
  let refund = attempt?.providerRefundId
    ? await callRefundProvider('retrieve', () => operations.getRefund(attempt!.providerRefundId!))
    : null
  if (!refund && attempt && (await needsRefundMetadataDiscovery(lease.id))) {
    const discovery = await discoverRefundByOperationMetadata(
      attempt,
      lease.leaseToken,
      policy.lookup(context),
      async options => {
        const page = await callRefundProvider('list', () => operations.listRefundPage(options))
        return { ...page, nextCursor: page.nextCursor ?? null }
      },
    )
    if (discovery.outcome === 'pending') {
      await handleRefundProviderOutcome(
        policy,
        lease,
        'Stripe refund metadata discovery page budget was exhausted',
      )
      return
    }
    if (discovery.outcome === 'not_found') attempt = null
    refund =
      discovery.outcome === 'found'
        ? await callRefundProvider('retrieve', () => operations.getRefund(discovery.refund.id))
        : null
  }
  if (refund && attempt && !attempt.providerRefundId)
    attempt = await enrichRefundReconciliationAttemptProviderRefund(attempt.id, refund.id)

  if (refund && refund.status !== 'failed' && refund.status !== 'canceled') {
    await reconcileObservedRefund(lease, context, attempt!, refund, policy)
    return
  }

  if (!attempt || refund) {
    const key = policy.providerIdempotencyKey(lease, refund)
    attempt = await recordRefundReconciliationAttempt(lease, key)
    refund = null
  }
  if (!refund) {
    refund = await callRefundProvider('create', () =>
      operations.createRefund({
        ...policy.createLookup(context),
        amountMinorUnits: lease.amount.amount,
        idempotencyKey: attempt.providerIdempotencyKey,
        metadata: {
          membership_refund_operation_id: lease.id,
          membership_refund_attempt_id: attempt.id,
        },
      }),
    )
  }
  if (!attempt.providerRefundId)
    await enrichRefundReconciliationAttemptProviderRefund(attempt.id, refund.id)
  await reconcileObservedRefund(lease, context, attempt, refund, policy)
}

async function reconcileObservedRefund<Context>(
  lease: RefundReconciliationLease,
  context: Context,
  _attempt: { id: string },
  refund: {
    id: string
    amount: number
    currency: string
    status: string | null
    charge: string | { id: string } | null
    payment_intent: string | { id: string } | null
  },
  policy: RefundReconciliationPolicy<Context>,
): Promise<void> {
  if (refund.status === 'failed' || refund.status === 'canceled') {
    await handleRefundProviderOutcome(policy, lease, `Stripe refund is ${refund.status}`)
    return
  }
  if (refund.status !== 'succeeded') {
    await handleRefundProviderOutcome(
      policy,
      lease,
      `Stripe refund is ${refund.status ?? 'pending'}`,
    )
    return
  }
  if (
    refund.amount !== lease.amount.amount ||
    refund.currency !== lease.amount.currency ||
    !isCurrencyCode(refund.currency)
  ) {
    await handleRefundProviderOutcome(
      policy,
      lease,
      'Stripe refund amount or currency does not match the immutable request',
    )
    return
  }
  const completion = await policy.complete(lease, context, refund)
  if (completion === 'pending')
    await handleRefundProviderOutcome(
      policy,
      lease,
      'Stripe refund succeeded but membership cancellation is pending',
    )
}
