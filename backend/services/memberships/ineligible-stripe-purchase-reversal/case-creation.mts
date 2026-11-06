import type { QueryExecutor } from '@data-stores/psql'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import sql from 'sql-template-strings'
import type { StripeMembershipSourceIdentity } from '../create-types.mts'
import { createProviderMembershipSource } from '../provider-source.mts'

export type PreparedIneligibleStripePurchaseCaseInput = {
  sourceIdentity: StripeMembershipSourceIdentity
  invoice: StripeInvoiceWithAllPayments
  stripePriceId: string
  winningSourceKind: 'direct' | 'family'
  collisionAt: Date
}
export type IneligibleStripePurchaseCaseInput = PreparedIneligibleStripePurchaseCaseInput & {
  userId: string
}
export type IneligibleStripePurchaseSource = {
  id: string
  lineageId: string
  bindingId: string
}

function calculateIneligibleStripePurchaseRefundCap(
  qualifyingAmountMinorUnits: number,
  periodStartedAt: Date,
  periodEndsAt: Date,
  collisionAt: Date,
): number {
  if (!Number.isSafeInteger(qualifyingAmountMinorUnits) || qualifyingAmountMinorUnits < 0)
    throw new Error('Stripe purchase qualifying amount must be a nonnegative safe integer')
  const started = BigInt(periodStartedAt.getTime())
  const ended = BigInt(periodEndsAt.getTime())
  const collided = BigInt(collisionAt.getTime())
  if (ended < started) throw new Error('Stripe purchase period ends before it starts')
  if (ended === started || collided <= started) return qualifyingAmountMinorUnits
  if (collided >= ended) return 0
  return Number((BigInt(qualifyingAmountMinorUnits) * (ended - collided)) / (ended - started))
}

export async function recordIneligibleStripePurchaseCaseForCollision(
  input: IneligibleStripePurchaseCaseInput,
  query: QueryExecutor,
): Promise<boolean> {
  const inserted = await recordIneligibleStripePurchaseCasesForCollision([input], query)
  return inserted.includes(input.invoice.id)
}

async function recordIneligibleStripePurchaseCasesForCollision(
  inputs: readonly IneligibleStripePurchaseCaseInput[],
  query: QueryExecutor,
): Promise<string[]> {
  const first = inputs[0]
  if (!first) return []
  for (const input of inputs) {
    if (
      input.userId !== first.userId ||
      input.sourceIdentity.environment !== first.sourceIdentity.environment ||
      input.sourceIdentity.applicationId !== first.sourceIdentity.applicationId ||
      input.sourceIdentity.providerLineageId !== first.sourceIdentity.providerLineageId ||
      input.sourceIdentity.providerAccountId !== first.sourceIdentity.providerAccountId
    )
      throw new Error('Stripe reversal case batch must share one source identity')
  }
  const cases = inputs.map(prepareIneligibleStripePurchaseCase).filter(value => value !== null)
  if (cases.length === 0) return []
  const source = await createProviderMembershipSource(
    { userId: first.userId, sourceKind: 'direct', sourceIdentity: first.sourceIdentity },
    query,
  )
  return recordPreparedIneligibleStripePurchaseCasesForCollision(inputs, source, query)
}

export async function recordPreparedIneligibleStripePurchaseCasesForCollision(
  inputs: readonly PreparedIneligibleStripePurchaseCaseInput[],
  source: IneligibleStripePurchaseSource,
  query: QueryExecutor,
): Promise<string[]> {
  const cases = inputs.map(prepareIneligibleStripePurchaseCase).filter(value => value !== null)
  if (cases.length === 0) return []
  const { rows } = await query(sql`/* recordIneligibleStripePurchaseCaseForCollision */
    INSERT INTO membership_ineligible_purchase_reversal_cases (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      originating_invoice_id, stripe_price_id, winning_source_kind,
      qualifying_amount_minor_units, refund_cap_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    )
    SELECT ${source.id}, ${source.lineageId}, ${source.bindingId},
      input.originating_invoice_id, input.stripe_price_id, input.winning_source_kind,
      input.qualifying_amount_minor_units, input.refund_cap_minor_units, input.currency_code,
      input.period_started_at, input.period_ends_at, input.collision_at
    FROM UNNEST(
      ${cases.map(value => value.invoiceId)}::TEXT[],
      ${cases.map(value => value.stripePriceId)}::TEXT[],
      ${cases.map(value => value.winningSourceKind)}::membership_source_kinds[],
      ${cases.map(value => value.qualifyingAmountMinorUnits)}::BIGINT[],
      ${cases.map(value => value.refundCapMinorUnits)}::BIGINT[],
      ${cases.map(value => value.currency)}::currency_codes[],
      ${cases.map(value => value.periodStartedAt)}::TIMESTAMPTZ[],
      ${cases.map(value => value.periodEndsAt)}::TIMESTAMPTZ[],
      ${cases.map(value => value.collisionAt)}::TIMESTAMPTZ[]
    ) AS input(originating_invoice_id, stripe_price_id, winning_source_kind,
      qualifying_amount_minor_units, refund_cap_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at)
    WHERE TRUE
    ORDER BY input.originating_invoice_id
    ON CONFLICT (membership_provider_lineage_id, originating_invoice_id) DO NOTHING
    RETURNING originating_invoice_id AS "invoiceId"
  `)
  return (rows as Array<{ invoiceId: string }>).map(row => row.invoiceId)
}

function prepareIneligibleStripePurchaseCase(input: PreparedIneligibleStripePurchaseCaseInput) {
  const { invoice, sourceIdentity } = input
  const invoiceCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (
    invoiceCustomerId &&
    sourceIdentity.providerAccountId &&
    invoiceCustomerId !== sourceIdentity.providerAccountId
  )
    throw new Error(`Stripe invoice ${invoice.id} customer does not match its subscription`)
  if (invoice.lines.data.length !== 1)
    throw new Error(`Stripe invoice ${invoice.id} must have exactly one membership purchase line`)
  const line = invoice.lines.data[0]!
  const price = line.pricing?.price_details?.price
  const priceId = typeof price === 'string' ? price : price?.id
  if (priceId !== input.stripePriceId || line.currency !== invoice.currency)
    throw new Error(`Stripe invoice ${invoice.id} does not match the membership purchase price`)
  const periodStartedAt = new Date(line.period.start * 1_000)
  const periodEndsAt = new Date(line.period.end * 1_000)
  if (
    (periodEndsAt > periodStartedAt && input.collisionAt >= periodEndsAt) ||
    (periodEndsAt.getTime() === periodStartedAt.getTime() && input.collisionAt > periodStartedAt)
  )
    return null
  const qualifyingAmountMinorUnits = invoice.total
  if (!Number.isSafeInteger(qualifyingAmountMinorUnits) || qualifyingAmountMinorUnits < 0)
    throw new Error(`Stripe invoice ${invoice.id} has an invalid qualifying amount`)
  const collisionAt = new Date(Math.max(input.collisionAt.getTime(), periodStartedAt.getTime()))
  const refundCapMinorUnits = calculateIneligibleStripePurchaseRefundCap(
    qualifyingAmountMinorUnits,
    periodStartedAt,
    periodEndsAt,
    collisionAt,
  )
  return {
    invoiceId: invoice.id,
    stripePriceId: input.stripePriceId,
    winningSourceKind: input.winningSourceKind,
    qualifyingAmountMinorUnits,
    refundCapMinorUnits,
    currency: invoice.currency,
    periodStartedAt,
    periodEndsAt,
    collisionAt,
  }
}
