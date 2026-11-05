import { registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'
import * as stripeInvoices from '@modules/stripe/invoices'
import type { StripeInvoiceWithAllPayments } from '@modules/stripe/invoices'
import { mapWithConcurrency } from '@vouchington/utils/async'
import sql from 'sql-template-strings'
import type { StripeMembershipSourceIdentity } from '../create-types.mts'
import type { MembershipPlanSlug } from '../types.mts'
import { getSkuByStripePriceIdForLifecycle } from '../get-catalog.mts'
import { getMembershipWorkLimit } from '../work-limits.mts'
import { isHigherMembershipPlan } from '../plan-ranking.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from '../reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import {
  recordIneligibleStripePurchaseCasesForCollision,
  type IneligibleStripePurchaseCaseInput,
} from './case-creation.mts'

type Winner = {
  userId: string
  sourceIdentity: StripeMembershipSourceIdentity
  winningSourceKind: 'direct' | 'family'
  winningPlan?: 'plus' | 'pro'
  collisionAt: Date
}

export async function recordIneligibleStripePurchasesForWinner(
  options: Winner,
  query: QueryExecutor,
): Promise<number> {
  const invoices = await stripeInvoices.listAllStripeSubscriptionInvoices(
    options.sourceIdentity.providerLineageId,
    {
      invoicePages: getMembershipWorkLimit('stripe_subscription_invoice_max_pages'),
      paymentPages: getMembershipWorkLimit('stripe_invoice_payment_max_pages'),
      linePages: getMembershipWorkLimit('stripe_invoice_line_max_pages'),
    },
  )
  const caseInputs = (
    await mapWithConcurrency(invoices, 1, invoice => buildCaseInput(invoice, options))
  ).filter(input => input !== null)
  const createdInvoiceIds = await recordIneligibleStripePurchaseCasesForCollision(caseInputs, query)
  caseInputs.forEach(input => {
    registerPostCommitAction(query, async () => {
      await reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: input.invoice.id,
        providerApplicationId: options.sourceIdentity.applicationId,
        providerEnvironment: options.sourceIdentity.environment,
      })
    })
  })
  return createdInvoiceIds.length
}

async function buildCaseInput(
  invoice: Awaited<ReturnType<typeof stripeInvoices.listAllStripeSubscriptionInvoices>>[number],
  options: Winner,
): Promise<IneligibleStripePurchaseCaseInput | null> {
  if (invoice.status !== 'paid' && invoice.status !== 'open') return null
  const mappedLines = await getMappedStripeMembershipInvoiceLines(invoice, options.sourceIdentity)
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

export async function recordDisplacedStripePurchaseCases(
  options: {
    userId: string
    winningSourceKind: 'direct' | 'family'
    winningPlan: 'plus' | 'pro'
    collisionAt: Date
  },
  query: QueryExecutor,
): Promise<number> {
  const { rows } = await query(buildGetDisplacedStripeSourceForCollisionQuery(options.userId))
  const displaced = rows[0] as
    | {
        environment: 'test' | 'production'
        applicationId: string
        subscriptionId: string
        customerId: string | null
      }
    | undefined
  if (!displaced) return 0
  return recordIneligibleStripePurchasesForWinner(
    {
      userId: options.userId,
      sourceIdentity: {
        provider: 'stripe',
        environment: displaced.environment,
        applicationId: displaced.applicationId,
        providerLineageId: displaced.subscriptionId,
        providerAccountId: displaced.customerId,
      },
      winningSourceKind: options.winningSourceKind,
      winningPlan: options.winningPlan,
      collisionAt: options.collisionAt,
    },
    query,
  )
}

export function buildGetDisplacedStripeSourceForCollisionQuery(userId: string) {
  return sql`/* getDisplacedStripeSourceForCollision */
    SELECT context.environment, context.application_id AS "applicationId",
      lineage.provider_lineage_id AS "subscriptionId", lineage.provider_account_id AS "customerId"
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
    WHERE membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
      AND membership.paused_at IS NULL
      AND source.source_kind = 'direct' AND context.provider = 'stripe'
    LIMIT 1 FOR SHARE OF membership, source, lineage
  `
}
