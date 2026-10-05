import * as stripeCheckout from './checkout.mts'
import * as stripeCustomers from './customers.mts'
import * as stripeIdentity from './identity.mts'
import { listStripeSubscriptionInvoices } from './invoices.mts'
import { createBillingPortalSession } from './portal.mts'
import { createStripeRefund } from './refunds.mts'
import { cancelStripeSubscriptionImmediately } from './subscriptions.mts'
import type {
  CancelSubscriptionImmediatelyPayload,
  CreateBillingPortalSessionPayload,
  CreateIdentityCheckoutSessionPayload,
  CreateMembershipCheckoutSessionPayload,
  CreateRefundPayload,
  ListSubscriptionInvoicesPayload,
  RetrieveIdentityVerificationSessionUrlPayload,
  StripeBillingPortalSessionResult,
  StripeCheckoutSessionResult,
  StripeInvoiceSummary,
  StripeRefundResult,
} from './types.mts'

export * from './types.mts'

export async function createMembershipCheckoutSessionOperation(
  payload: CreateMembershipCheckoutSessionPayload,
): Promise<StripeCheckoutSessionResult> {
  const customer = await stripeCustomers.getOrCreateStripeCustomer(
    payload.userId,
    payload.email,
    undefined,
    payload.customerIdempotencyKey,
  )
  const session = await stripeCheckout.createCheckoutSession({
    customerId: customer.id,
    priceId: payload.priceId,
    successUrl: payload.successUrl,
    cancelUrl: payload.cancelUrl,
    metadata: { membership_purchase_intent_id: payload.purchaseIntentId },
    idempotencyKey: payload.checkoutIdempotencyKey,
  })
  return { id: session.id, url: session.url }
}

export async function createIdentityCheckoutSessionOperation(
  payload: CreateIdentityCheckoutSessionPayload,
): Promise<StripeCheckoutSessionResult> {
  const customer = await stripeCustomers.getOrCreateStripeCustomer(
    payload.userId,
    payload.email,
    undefined,
    payload.customerIdempotencyKey,
  )
  const session = await stripeCheckout.createOneTimeCheckoutSession({
    customerId: customer.id,
    priceAmountMinorUnits: payload.priceAmountMinorUnits,
    currency: payload.currency,
    productName: payload.productName,
    successUrl: payload.successUrl,
    cancelUrl: payload.cancelUrl,
    metadata: payload.metadata,
    idempotencyKey: payload.checkoutIdempotencyKey,
  })
  return { id: session.id, url: session.url }
}

export async function createBillingPortalSessionOperation(
  payload: CreateBillingPortalSessionPayload,
): Promise<StripeBillingPortalSessionResult> {
  const session = await createBillingPortalSession(
    payload.customerId,
    payload.returnUrl,
    payload.idempotencyKey,
    payload.cancellationSubscriptionId,
  )
  return { url: session.url }
}

export function retrieveIdentityVerificationSessionUrlOperation(
  payload: RetrieveIdentityVerificationSessionUrlPayload,
): Promise<string | null> {
  return stripeIdentity.stripeRetrieveVerificationSessionUrl(payload.sessionId)
}

export async function listSubscriptionInvoicesOperation(
  payload: ListSubscriptionInvoicesPayload,
): Promise<StripeInvoiceSummary[]> {
  const invoices = await listStripeSubscriptionInvoices(payload.subscriptionId, {
    limit: payload.limit,
  })
  return invoices.data.map(invoice => {
    const payments = (invoice as InvoiceWithPayments).payments?.data ?? []
    return {
      id: invoice.id,
      status: invoice.status,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      created: invoice.created,
      description: invoice.description ?? null,
      payments: payments.map(({ amount_paid: amountPaid, payment }) => ({
        amountPaid,
        payment: {
          type: payment?.type ?? '',
          chargeId: payment?.type === 'charge' ? (payment.charge ?? null) : null,
          paymentIntentId:
            payment?.type === 'payment_intent' ? (payment.payment_intent ?? null) : null,
        },
      })),
    }
  })
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/backend/modules/stripe/README.md`.
 */
export async function createRefundOperation(
  payload: CreateRefundPayload,
): Promise<StripeRefundResult> {
  const refund = await createStripeRefund(payload)
  return {
    id: refund.id,
    chargeId: expandableId(refund.charge),
    paymentIntentId: expandableId(refund.payment_intent),
    amount: refund.amount,
    currency: refund.currency,
  }
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/backend/modules/stripe/README.md`.
 */
export async function cancelSubscriptionImmediatelyOperation(
  payload: CancelSubscriptionImmediatelyPayload,
): Promise<null> {
  await cancelStripeSubscriptionImmediately(payload.subscriptionId)
  return null
}

type InvoiceWithPayments = {
  payments?: {
    data: Array<{
      amount_paid: number
      payment?: {
        type: string
        charge?: string | null
        payment_intent?: string | null
      } | null
    }>
  }
}

function expandableId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null)
}
