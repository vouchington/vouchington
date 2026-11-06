import * as stripeInvoices from '@modules/stripe/invoices'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import { mapWithConcurrency } from '@vouchington/utils/async'
import type { StripeMembershipSourceIdentity } from '../create-types.mts'
import type { MembershipPlanSlug } from '../types.mts'
import { getSkuByStripePriceIdForLifecycle } from '../get-catalog.mts'
import { getMembershipWorkLimit } from '../work-limits.mts'
import type { PreparedIneligibleStripePurchaseCaseInput } from './case-creation.mts'
import { getStripePurchaseCollisionPlans } from './collision-catalog.mts'
import type { StripePurchaseCollisionWork } from './collision-work.mts'
import type { QualifyingStripeCollision } from './collision-resolution.mts'

type MappedLine = {
  line: StripeInvoiceWithAllPayments['lines']['data'][number]
  priceId: string
  plan: MembershipPlanSlug
}

export type StripePurchaseCollisionCandidate = {
  invoice: StripeInvoiceWithAllPayments
  mappedLines: MappedLine[]
}

export async function prepareStripePurchaseCollisionCandidates(
  options: StripePurchaseCollisionWork,
): Promise<StripePurchaseCollisionCandidate[]> {
  const invoices = await stripeInvoices.listAllStripeSubscriptionInvoices(
    options.sourceIdentity.providerLineageId,
    {
      invoicePages: getMembershipWorkLimit('stripe_subscription_invoice_max_pages'),
      paymentPages: getMembershipWorkLimit('stripe_invoice_payment_max_pages'),
      linePages: getMembershipWorkLimit('stripe_invoice_line_max_pages'),
    },
  )
  const plans = await getStripePurchaseCollisionPlans(options, invoices)
  return invoices.flatMap(invoice => {
    if (invoice.status !== 'paid' && invoice.status !== 'open') return []
    const mappedLines = invoice.lines.data.flatMap(line => {
      const price = line.pricing?.price_details?.price
      const priceId = typeof price === 'string' ? price : price?.id
      const plan = priceId ? plans.get(priceId) : undefined
      return priceId && plan ? [{ line, priceId, plan }] : []
    })
    return mappedLines.length > 0 ? [{ invoice, mappedLines }] : []
  })
}

export function buildStripePurchaseCollisionCaseInputs(
  candidates: readonly StripePurchaseCollisionCandidate[],
  sourceIdentity: StripeMembershipSourceIdentity,
  collisions: ReadonlyMap<MembershipPlanSlug, QualifyingStripeCollision>,
): PreparedIneligibleStripePurchaseCaseInput[] {
  return candidates.flatMap(({ invoice, mappedLines }) => {
    const overlapping = mappedLines.filter(({ line, plan }) => {
      const collision = collisions.get(plan)
      if (!collision) return false
      const collisionAt = collision.collisionAt.getTime()
      return !(
        (line.period.end > line.period.start && collisionAt >= line.period.end * 1_000) ||
        (line.period.end === line.period.start && collisionAt > line.period.start * 1_000)
      )
    })
    if (overlapping.length === 0) return []
    if (mappedLines.length !== 1 || invoice.lines.data.length !== 1)
      throw new Error(`Stripe invoice ${invoice.id} has ambiguous membership purchase lines`)
    const { priceId, plan } = overlapping[0]!
    const collision = collisions.get(plan)!
    return [
      {
        sourceIdentity,
        invoice,
        stripePriceId: priceId,
        winningSourceKind: collision.winningSourceKind,
        collisionAt: collision.collisionAt,
      },
    ]
  })
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
