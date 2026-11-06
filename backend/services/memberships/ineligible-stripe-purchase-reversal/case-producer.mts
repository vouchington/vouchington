import * as stripeInvoices from '@modules/stripe/invoices'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import { mapWithConcurrency } from '@vouchington/utils/async'
import type { StripeMembershipSourceIdentity } from '../create-types.mts'
import type { MembershipPlanSlug } from '../types.mts'
import { getSkuByStripePriceIdForLifecycle } from '../get-catalog.mts'
import { getMembershipWorkLimit } from '../work-limits.mts'
import { isHigherMembershipPlan } from '../plan-ranking.mts'
import type { PreparedIneligibleStripePurchaseCaseInput } from './case-creation.mts'
import { getStripePurchaseCollisionPlans } from './collision-catalog.mts'
import type { StripePurchaseCollisionWork } from './collision-work.mts'

export async function prepareIneligibleStripePurchaseCasesForWinner(
  options: StripePurchaseCollisionWork,
): Promise<PreparedIneligibleStripePurchaseCaseInput[]> {
  const invoices = await stripeInvoices.listAllStripeSubscriptionInvoices(
    options.sourceIdentity.providerLineageId,
    {
      invoicePages: getMembershipWorkLimit('stripe_subscription_invoice_max_pages'),
      paymentPages: getMembershipWorkLimit('stripe_invoice_payment_max_pages'),
      linePages: getMembershipWorkLimit('stripe_invoice_line_max_pages'),
    },
  )
  const plans = await getStripePurchaseCollisionPlans(options, invoices)
  return invoices
    .map(invoice => buildCaseInput(invoice, options, plans))
    .filter(input => input !== null)
}

function buildCaseInput(
  invoice: Awaited<ReturnType<typeof stripeInvoices.listAllStripeSubscriptionInvoices>>[number],
  options: StripePurchaseCollisionWork,
  plans: ReadonlyMap<string, MembershipPlanSlug>,
): PreparedIneligibleStripePurchaseCaseInput | null {
  if (invoice.status !== 'paid' && invoice.status !== 'open') return null
  const mappedLines = invoice.lines.data.flatMap(line => {
    const price = line.pricing?.price_details?.price
    const priceId = typeof price === 'string' ? price : price?.id
    const plan = priceId ? plans.get(priceId) : undefined
    return priceId && plan ? [{ line, priceId, plan }] : []
  })
  if (mappedLines.length === 0) return null
  if (mappedLines.length !== 1 || invoice.lines.data.length !== 1)
    throw new Error(`Stripe invoice ${invoice.id} has ambiguous membership purchase lines`)
  const { line, priceId, plan } = mappedLines[0]!
  if (
    options.winningSourceKind === 'family' &&
    options.winningPlan &&
    isHigherMembershipPlan(plan, options.winningPlan)
  )
    return null
  const periodStart = line.period.start
  const periodEnd = line.period.end
  const collisionAt = options.collisionAt.getTime()
  if (
    (periodEnd > periodStart && collisionAt >= periodEnd * 1_000) ||
    (periodEnd === periodStart && collisionAt > periodStart * 1_000)
  )
    return null
  return { ...options, invoice, stripePriceId: priceId }
}

export async function getMappedStripeMembershipInvoiceLines(
  invoice: StripeInvoiceWithAllPayments,
  sourceIdentity: StripeMembershipSourceIdentity,
): Promise<
  Array<{
    line: StripeInvoiceWithAllPayments['lines']['data'][number]
    priceId: string
    plan: MembershipPlanSlug
  }>
> {
  return (
    await mapWithConcurrency(invoice.lines.data, 1, async line => {
      const price = line.pricing?.price_details?.price
      const priceId = typeof price === 'string' ? price : price?.id
      if (!priceId) return null
      const sku = await getSkuByStripePriceIdForLifecycle(priceId, sourceIdentity)
      return sku ? { line, priceId, plan: sku.plan } : null
    })
  ).filter(line => line !== null)
}
