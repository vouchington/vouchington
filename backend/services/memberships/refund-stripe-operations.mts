import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { getLatestMembershipByUserId } from './get.mts'
import type {
  CancelSubscriptionImmediatelyPayload,
  CreateRefundPayload,
  ListSubscriptionInvoicesPayload,
  StripeInvoiceSummary,
  StripeRefundResult,
} from '@modules/stripe/operations'
import type { RefundableCharge } from './types.mts'
import { isCurrencyCode, parsePostgresMoneyAmount } from '@ts-shared/money'

export type MembershipStripeOperations = {
  listSubscriptionInvoices: (
    payload: ListSubscriptionInvoicesPayload,
  ) => Promise<StripeInvoiceSummary[]>
  createRefund: (payload: CreateRefundPayload) => Promise<StripeRefundResult>
  cancelSubscriptionImmediately: (payload: CancelSubscriptionImmediatelyPayload) => Promise<null>
}

export async function listRefundableCharges(
  _currentUserId: string,
  targetUserId: string,
  stripeOperations: Pick<MembershipStripeOperations, 'listSubscriptionInvoices'>,
): Promise<RefundableCharge[]> {
  const membership = await getLatestMembershipByUserId(targetUserId)
  if (!membership?.stripe_subscription_id) return []
  return listRefundableChargesForSubscription(membership.stripe_subscription_id, stripeOperations)
}

export async function listRefundableChargesForSubscription(
  subscriptionId: string,
  stripeOperations: Pick<MembershipStripeOperations, 'listSubscriptionInvoices'>,
): Promise<RefundableCharge[]> {
  const invoiceList = await stripeOperations.listSubscriptionInvoices({
    subscriptionId,
    limit: 100,
  })
  type PendingCharge = Omit<RefundableCharge, 'amount_refunded'>
  const pending: PendingCharge[] = []
  for (const invoice of invoiceList) {
    if (invoice.status !== 'paid' || !isCurrencyCode(invoice.currency)) continue
    for (const invoicePayment of invoice.payments) {
      const payment = invoicePayment.payment
      const chargeId: string | null = payment.type === 'charge' ? payment.chargeId : null
      const paymentIntentId: string | null =
        payment.type === 'payment_intent' ? payment.paymentIntentId : null
      if (!chargeId && !paymentIntentId) continue
      pending.push({
        charge_id: chargeId,
        payment_intent_id: paymentIntentId,
        invoice_id: invoice.id,
        amount: {
          amount: invoicePayment.amountPaid ?? invoice.amountPaid,
          currency: invoice.currency,
        },
        created_at: new Date(invoice.created * 1000),
        description: invoice.description ?? null,
      })
    }
  }
  const refundedMinorUnitsByLookupKey = await getAlreadyRefundedMinorUnits(pending)
  return pending.map(charge => ({
    ...charge,
    amount_refunded: {
      amount: refundedMinorUnitsByLookupKey.get(getRefundLookup(charge).key) ?? 0,
      currency: charge.amount.currency,
    },
  }))
}

export type RefundLookupType = 'charge' | 'payment_intent'

/**
 * The batched query behind {@link getAlreadyRefundedMinorUnits}, extracted so its rendered
 * SQL can be snapshot-tested and EXPLAIN-scenario-gated per the Query → Index Impact recipe
 * (backend/data-stores/psql/CLAUDE.md#querying-rules). `lookupTypes[i]`/`lookupIds[i]` pair
 * positionally; `type: 'charge'` matches `idx_mrefunds__stripe_charge_id`, `type:
 * 'payment_intent'` matches the partial `idx_mrefunds__stripe_payment_intent_id`.
 */
export function buildAlreadyRefundedMinorUnitsQuery(
  lookupTypes: readonly RefundLookupType[],
  lookupIds: readonly string[],
): SQLStatement {
  return sql`/* getAlreadyRefundedMinorUnits */
    WITH requested_refunds AS (
      SELECT lookup_type, lookup_id
      FROM UNNEST(${lookupTypes}::TEXT[], ${lookupIds}::TEXT[])
        AS requested_refund(lookup_type, lookup_id)
    )
    SELECT
      requested_refunds.lookup_type || ':' || requested_refunds.lookup_id AS lookup_key,
      COALESCE(SUM(membership_refunds.amount_minor_units), 0)::TEXT AS total
    FROM requested_refunds
    LEFT JOIN membership_refunds
      ON (
        requested_refunds.lookup_type = 'charge'
        AND membership_refunds.stripe_charge_id = requested_refunds.lookup_id
      )
      OR (
        requested_refunds.lookup_type = 'payment_intent'
        AND membership_refunds.stripe_payment_intent_id = requested_refunds.lookup_id
      )
    GROUP BY requested_refunds.lookup_type, requested_refunds.lookup_id
  `
}

async function getAlreadyRefundedMinorUnits(
  charges: ReadonlyArray<Pick<RefundableCharge, 'charge_id' | 'payment_intent_id'>>,
): Promise<Map<string, number>> {
  const lookups = new Map<string, ReturnType<typeof getRefundLookup>>()
  for (const charge of charges) {
    const lookup = getRefundLookup(charge)
    lookups.set(lookup.key, lookup)
  }
  if (lookups.size === 0) return new Map()

  const lookupTypes = [...lookups.values()].map(lookup => lookup.type)
  const lookupIds = [...lookups.values()].map(lookup => lookup.id)
  const { rows } = await read<{ lookup_key: string; total: string }>(
    buildAlreadyRefundedMinorUnitsQuery(lookupTypes, lookupIds),
  )
  return new Map(rows.map(row => [row.lookup_key, parsePostgresMoneyAmount(row.total)]))
}

function getRefundLookup(charge: Pick<RefundableCharge, 'charge_id' | 'payment_intent_id'>): {
  id: string
  key: string
  type: RefundLookupType
} {
  if (charge.charge_id) {
    return {
      id: charge.charge_id,
      key: `charge:${charge.charge_id}`,
      type: 'charge',
    }
  }
  if (!charge.payment_intent_id) {
    throw new Error('Refundable charge is missing a Stripe identifier')
  }
  return {
    id: charge.payment_intent_id,
    key: `payment_intent:${charge.payment_intent_id}`,
    type: 'payment_intent',
  }
}

export function matchesRefundRequest(
  charge: RefundableCharge,
  options: { chargeId: string | null; invoiceId: string; paymentIntentId: string | null },
): boolean {
  if (charge.invoice_id !== options.invoiceId) return false
  if (options.chargeId && charge.charge_id !== options.chargeId) return false
  if (options.paymentIntentId && charge.payment_intent_id !== options.paymentIntentId) return false
  return Boolean(options.chargeId || options.paymentIntentId)
}
